## AC2 — Repo Topology

### 1. Monorepo feasibility — confirmed against actual repo structure

The current repo is a single Next.js app rooted at the repo root: `app/`,
`components/`, `hooks/`, `lib/`, `types/`, `scripts/`, `public/`, `styles/` all sit
directly under `/`, alongside root-level config (`package.json`, `tsconfig.json`,
`next.config.mjs`, `tailwind.config.ts`, `components.json`, `jest.config.js`,
`middleware.ts`, `Procfile`). There is **no existing `apps/` nesting** and no
`.github/workflows/` directory today (no CI exists yet — confirmed by directory
listing).

The epic proposes two monorepo shapes:
- `apps/web` (existing Next.js) + `apps/api` (FastAPI)
- a simpler `api/` directory alongside the current app, unmoved

**Recommendation: the simpler `api/`-alongside-root layout, not the `apps/` nesting.**
Given this repo's actual (unnested) structure, moving the existing app into
`apps/web` is pure churn with no functional benefit at two-person hobby scale — it
would require moving `app/`, `components/`, `hooks/`, `lib/`, `types/`, `scripts/`,
`public/`, `styles/`, and touching every config file that has root-relative paths:
`tsconfig.json`'s `@/*` alias target, `tailwind.config.ts` content globs,
`jest.config.js` `roots`/`moduleNameMapper`, `components.json` (shadcn aliases),
`next.config.mjs`, `middleware.ts` matcher paths, and the `Procfile` (`web: npm
start` currently assumes `npm start` runs from repo root — Heroku would need either
a subdirectory buildpack config or an npm workspace root `package.json` that
delegates). None of that is required to get a Python backend running side-by-side.
Adding `api/` at the root achieves the same isolation (own toolchain, own path
prefix for CI filtering, own tests directory) with **zero changes to existing
files** — it is strictly additive.

Adopt the `apps/` nesting later only if a third app is ever needed (e.g., a
separate admin tool) — not preemptively.

**What moves:** nothing existing. **What's new:** an `api/` directory tree plus
`.github/workflows/`.

**What a root-level `package.json` / config split implies:** none, under this
recommendation. `package.json` at root keeps governing the web app exactly as
today (`npm run dev/build/lint/test` unchanged) — no npm workspaces needed, since
there is still only one JS app. Python tooling (`pyproject.toml` or
`requirements.txt`, virtualenv) lives entirely inside `api/` and never touches the
npm toolchain. The two toolchains coexist without collision; a fresh clone still
runs `npm install && npm run dev` for the frontend, and separately `cd api && pip
install -r requirements.txt` (or `uv sync`) for the backend.

```
survivor/
├── app/                      # existing Next.js app router — UNCHANGED
├── components/                # UNCHANGED
├── hooks/                     # UNCHANGED
├── lib/                       # UNCHANGED (db.ts stays the Mongo access layer for the web app)
├── types/                     # UNCHANGED (may later be generated — see CR-101-C)
├── scripts/                   # UNCHANGED (TS ops scripts; may migrate to api/ over time, out of scope here)
├── public/                    # UNCHANGED
├── styles/                    # UNCHANGED
├── middleware.ts              # UNCHANGED
├── package.json                # UNCHANGED — still the web app's manifest
├── tsconfig.json               # UNCHANGED
├── next.config.mjs             # UNCHANGED
├── tailwind.config.ts          # UNCHANGED
├── jest.config.js              # UNCHANGED
├── Procfile                    # UNCHANGED (web dyno); a second process entry only
│                                #   needed if/when the Python backend deploys as
│                                #   its own dyno/process — see CR-101-A for the
│                                #   single-dyno packaging alternative
│
├── api/                        # NEW — FastAPI backend (DEC-1)
│   ├── app/
│   │   ├── main.py             # FastAPI app entrypoint
│   │   ├── routers/            # HTTP route modules
│   │   ├── models/             # Pydantic models — contract source of truth (DEC-4)
│   │   ├── services/           # scoring / ingestion / data jobs (owned end-to-end)
│   │   └── db.py               # motor/pymongo client, same Mongo instance as lib/db.ts
│   ├── tests/                  # pytest suite
│   ├── pyproject.toml          # deps + ruff/mypy config (or requirements*.txt)
│   └── README.md               # api-specific setup, mirrors scripts/README.md style
│
└── .github/
    └── workflows/
        └── ci.yml               # NEW — path-aware, see CI sketch below (CR-002 implements)
```

### 2. Path-aware CI sketch

This mirrors exactly what **CR-002 AC5** asks for ("structure the workflow so
`web/**` and `api/**` — or equivalent — trigger their own jobs"). **This ticket
only produces the skeleton below; CR-002 is the ticket that actually adds
`.github/workflows/ci.yml` and wires up caching, secrets, and required-check
branch protection.** The two should not diverge — CR-002 should treat this sketch
as its starting point, not redesign the gating shape.

GitHub Actions doesn't support per-job `on.paths` filtering natively (top-level
`paths:` filters gate the whole workflow run, not individual jobs), so the
standard pattern is a cheap "changes" job using `dorny/paths-filter` whose outputs
gate the language-specific jobs via `if:`.

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      web: ${{ steps.filter.outputs.web }}
      api: ${{ steps.filter.outputs.api }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            web:
              - 'app/**'
              - 'components/**'
              - 'hooks/**'
              - 'lib/**'
              - 'types/**'
              - 'scripts/**'
              - 'public/**'
              - 'styles/**'
              - '*.config.*'
              - 'package*.json'
              - 'tsconfig.json'
              - 'jest.config.js'
              - 'middleware.ts'
            api:
              - 'api/**'

  web-ci:
    needs: changes
    if: needs.changes.outputs.web == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm test

  api-ci:
    needs: changes
    if: needs.changes.outputs.api == 'true'
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: api
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: pip
      - run: pip install -r requirements.txt -r requirements-dev.txt
      - run: ruff check .
      - run: mypy .
      - run: pytest
```

**Nuance to flag for CR-002's implementation, not resolved here:** if `web-ci` /
`api-ci` are set as required status checks in branch protection, a job skipped via
`if:` (because its path had no changes) reports as "skipped," and GitHub generally
treats a skipped required check as passing — but this should be verified when
CR-002 wires up branch protection, since behavior here has bitten teams before. A
common belt-and-suspenders fix is a trailing `ci-required` job that always runs and
inspects `needs.*.result` for `failure`, used as the actual required check instead
of `web-ci`/`api-ci` directly. Left as an implementation detail for CR-002, not a
blocker for this sketch.

### 3. Two-repo alternative (briefly, per the epic)

A two-repo split (separate `frontend` and `backend` repos) is not recommended for
this project. At two-person, hobby-scale, it trades a single-clone onboarding story
for one where a contract change spans two PRs in two repos and can deploy out of
order — the frontend expecting a field the backend hasn't shipped yet, or vice
versa. It doubles the onboarding surface (two clones, two READMEs, two sets of
local setup steps) and splits the deployment story right when CR-004 is trying to
make deployment legible to a second developer. None of the two-repo benefits
(independent release cadence, separate contributor pools, independently scaled
CI) apply to a family-scale survivor league with two developers. The monorepo
keeps the FE/BE contract atomic and onboarding single-clone, per the epic's
"Repository topology" section.

### Interaction with CR-002 and CR-203

**CR-002** is the ticket that actually implements this CI shape — it should add
`.github/workflows/ci.yml` using this sketch as its starting skeleton (not
redesign it), and its AC5 ("build the workflow path-aware from day one") is
already satisfied by structuring the `changes`/`web-ci`/`api-ci` split now, even
before `api/` exists (the `api` path filter simply never matches until CR-101 is a
go and `api/` is created, so `api-ci` never fires — no rewrite needed later, only
that job stops being permanently skipped). **CR-203** (onboarding documentation
hygiene) should, if this topology is adopted, document the `api/`-alongside-root
layout (or the deferred `apps/` alternative) so a newcomer reading `CLAUDE.md`
understands both toolchains live in one repo and where each one's code and tests
live.
