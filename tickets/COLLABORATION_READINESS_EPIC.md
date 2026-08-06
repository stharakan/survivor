# Epic: Collaboration Readiness

**Epic ID**: COLLAB-001
**Priority**: High
**Status**: Proposed (pending review)
**Estimated Story Points**: ~55 points (was ~70; SQL execution removed pending arch spike)
**Timeline**: Phased — quick wins in ~1-2 weeks; architecture spike gates the rest

## Epic Description

The codebase has been maintained by a single developer. A second collaborator is
joining soon. This epic captures the work that makes the repo safe, legible, and
parallelizable for two people — plus the architectural questions raised during
onboarding review (frontend/backend separation, language choice, database choice,
deployment automation) and a proper sandbox league for testing.

The findings below came from a folder-by-folder survey of `app/`, `components/`,
`lib/`, `hooks/`, `types/`, `scripts/`, `tickets/`, and root config.

### Collaborator profile (drives the architecture decisions)

**The incoming collaborator is very comfortable in Python and is *not* strongly
versed in SQL.** This single fact reshapes the architectural section of this epic:
it reopens the "no Python" decision, weakens the case for a SQL migration (the
typed-schema guardrail is only half-useful if one of two devs can't fluently read
it), and points toward a frontend/backend split with a Python backend and typed
data contracts on top of the existing MongoDB. Those decisions are captured below
and gated on a spike (CR-101).

## Guiding Constraint: Cost

**Keeping infrastructure cost down is a hard project constraint and a first-class
acceptance criterion on every ticket below.** Concretely:

- Prefer free tiers and usage-based pricing that stays at/near $0 for a low-traffic
  app (a family/friends survivor league is not a high-QPS product).
- Do not introduce a new paid managed service unless it removes an existing paid
  one or is strictly necessary. (E.g. in-memory rate limiting over managed Redis —
  see `SEC-003`.)
- Any migration must be **cost-neutral or cost-reducing** vs. today's MongoDB Atlas
  spend, or the savings must be explicitly justified.
- **A second runtime is a second thing to host.** A Python backend is the biggest
  cost risk in this epic and must be costed explicitly in CR-101 before commitment
  (free-tier target: Fly.io / Render / Railway free tier, or fold into the existing
  GCP project via Cloud Run scale-to-zero).
- CI/CD must live within free-tier build minutes; keep pipelines lean.
- Scheduled jobs: keep cadence no tighter than the game data actually requires
  (scoring `*/15`, game updates `0 */3`) to stay inside free invocation limits.

---

## Architectural Decisions Log

Decisions reached during onboarding review, recorded so the new collaborator
inherits the reasoning, not just the outcome. **DEC-1 and DEC-2 were reopened after
learning the collaborator's skill profile (Python-strong, SQL-light).**

### DEC-1: Introduce Python for the backend — **REOPENED (was: won't do)**
Previously closed on the premise that "the collaborator is comfortable in either
language, so there is no forcing function pulling toward Python." **That premise is
now false.** A Python-strong, SQL-light collaborator *is* a forcing function: the
work that suits Python (scoring, game ingestion, data jobs) is exactly the coherent
chunk they could own end-to-end, rather than contributing scattered edits across a
TypeScript codebase they're less at home in.

The costs named when this was closed still count against it and are real:
- A second runtime is a second thing to host (see Cost constraint).
- Splitting the shared scoring logic across a language boundary can worsen the
  existing duplication (CR-103) if not designed carefully — the fix is to have a
  *single* home for scoring in the backend, not two half-implementations.
- Both devs eventually touch both languages at the seam (API contract).

Net: this is now a genuine reopen, evaluated in CR-101, not a foregone "no."

### DEC-2: SQL migration — **LEAN NO-GO (was: under evaluation)**
The prior technical case for SQL was that a typed schema is the guardrail that keeps
two people from corrupting each other's mental model of the data. **That benefit is
undercut when one of the two developers isn't SQL-fluent** — you'd be buying a
guardrail one dev can't comfortably hold. Meanwhile, the *same* guardrail (typed,
validated data contracts) is available via Python dataclasses / Pydantic on top of
the existing MongoDB, at zero migration cost and with no new managed service. See
DEC-4. SQL is therefore deprioritized toward won't-do, pending the CR-101 spike
which now evaluates the whole architecture, not just the database.

### DEC-3: Deployment platform — **Codify what exists; don't re-platform blindly**
There are NO Google Cloud Functions checked into this repo. Deployment is Heroku
(`Procfile: web: npm start`). Scheduled backend updates run as GCP jobs that ping
endpoints in this repo on a cadence — but they are deployed by **manually copying
scripts up**, so the config lives only on one machine / the GCP console and is
invisible to a collaborator. Fix is to codify that deployment (CR-004), not to
re-platform. **Note the interaction with DEC-1:** these scheduled jobs are already a
de-facto separate backend that just pings endpoints, so they are the cleanest seam
to pilot a Python backend if DEC-1 lands on "go."

### DEC-4: Typed data contracts via Pydantic — **NEW, recommended**
The schema-drift risk (`ignoreBuildErrors: true`, `any`-typed aggregation results)
was the strongest argument for SQL. That guardrail can be bought without SQL:
Pydantic models become the single source of truth for the shape of data crossing the
frontend/backend boundary. Recommend **Pydantic over plain dataclasses** because it
validates and (de)serializes at the boundary — exactly where contracts break —
whereas plain dataclasses do neither. If the backend is **FastAPI**, those models
also emit an OpenAPI schema from which the frontend's TypeScript types (`types/`)
can be generated, keeping both sides in sync instead of drifting by hand.

---

## Architecture Direction Under Evaluation (CR-101)

The three collaborator-raised questions form **one coherent direction**, not three
independent choices. CR-101 evaluates them together:

1. **Separate frontend and backend, with a Python backend** (DEC-1). Lets the
   collaborator own a coherent Python chunk (scoring, ingestion, data jobs). Recommend
   **FastAPI** for the contract + auto-generated OpenAPI.
2. **Stay on MongoDB** (DEC-2). Now the better-supported choice: SQL's guardrail is
   half-useful to a SQL-light collaborator; Python + Mongo (motor / pymongo) is
   ergonomic; it's cost-neutral (no migration, no new service, ~21 pts avoided).
3. **Typed contracts via Pydantic** (DEC-4). Delivers the guardrail that justified
   SQL, without SQL.

### Repository topology: monorepo vs. two repos — **feasibility**

This decision is separable from the language decision and, for a two-person
family-scale project, **a monorepo is strongly recommended.** Options:

- **Single monorepo (recommended).** Keep frontend and backend in this one repo,
  e.g. `apps/web` (Next.js) + `apps/api` (FastAPI), or simply an `api/` (or
  `backend/`) directory alongside the existing Next.js app.
  - *Pros:* one clone / one PR / one CI config to get running (directly serves the
    "under 30 minutes from README" success metric); atomic commits can change the
    Pydantic contract and the consuming TS types together, so the contract never
    lands half-applied across two repos; a single place to codify deployment
    (CR-004). Polyglot is not a blocker — CI just runs `pytest`/`mypy` for `api/`
    and `tsc`/`lint`/`jest` for the web app, gated per changed path.
  - *Cons:* CI must be path-aware to avoid running everything on every change; two
    toolchains (`node` + `python`) in one repo means the README documents both.
  - *Cost:* $0 — one GitHub repo, one Actions allotment.
- **Two repos (frontend + backend).** Only worth it if the backend becomes a
  genuinely independent product with its own release cadence and separate
  contributors — **not the case for two people on a hobby-scale league.**
  - *Cons for us:* a contract change now spans two PRs in two repos and can deploy
    out of order (frontend expecting a field the backend hasn't shipped); doubles the
    onboarding surface; splits the deployment story. This directly fights the "clone
    and run in under 30 minutes" and "no single guaranteed merge-conflict point"
    metrics.

**Recommendation:** if DEC-1 is a go, add the Python backend as a second app *inside
this repo* (monorepo). Reach for two repos only if the backend later needs to be
deployed/released fully independently. This keeps the FE/BE contract atomic and the
onboarding single-clone.

### Contract-sync mechanism (evaluate in CR-101)

- **Pydantic → OpenAPI → TS types** (via FastAPI + a generator like
  `openapi-typescript`) run in CI, so `types/` is generated, not hand-maintained.
- Fallback: keep `types/` hand-written but add a CI check that fails if the OpenAPI
  schema and the committed TS types diverge.

### Deployment packaging idea: single Heroku dyno serving compiled FE assets — **to explore (fresh session)**

**Idea (not yet evaluated):** if the backend becomes Python (FastAPI), avoid paying
for / operating two separate web dynos by having **one Heroku app build the frontend
to static assets and let the Python backend serve them.** Sketch:

- A build step (Heroku multi-buildpack: `heroku/nodejs` then `heroku/python`, or a
  single `heroku-buildpack-multi`) compiles the frontend to static assets during
  slug build, and the Python app serves them (FastAPI `StaticFiles`) plus the API
  from the same dyno.
- *Pros:* one dyno = one thing to host = **directly serves the hard cost constraint**
  (a single free/eco dyno instead of two); one `Procfile`; no CORS between FE and BE
  (same origin); keeps the monorepo single-deploy story intact.
- *Cons / open questions (for the fresh session):*
  - **Next.js is not purely static.** This works cleanly only if the frontend is
    exported as static (`next export` / static output) — which sacrifices SSR, API
    routes, and other server-only Next features. Need to confirm the app doesn't
    depend on Next server features (it currently uses Next.js API routes — those
    would have to move to the Python backend, which is consistent with DEC-1 but is
    real work). If SSR is required, this idea doesn't apply and you're back to two
    processes.
  - Multi-buildpack build-time cost and slug size vs. free-tier build limits.
  - Where auth/session lives if the Next.js server layer goes away (see CR-101 AC4 —
    auth was assumed to stay in the Next.js layer; this idea challenges that).
- *Alternative framings to weigh in the same session:* two Heroku process types in
  one app (`web:` Python + a separate FE build served via CDN), or Cloud Run
  scale-to-zero for the Python API with the FE on a static host — compare cost and
  operational simplicity against the single-dyno approach.

This is explicitly a **park-and-explore** item; fold the evaluation into CR-101 AC1
(cost) and AC4 (what stays in the Next.js layer).

---

## Success Metrics
- A new collaborator can clone, configure, seed a realistic league, and run the app
  (frontend + backend if split) locally in under 30 minutes from the README alone.
- CI blocks type/test regressions on every PR, in **both** languages if the backend
  is split out (currently nothing does).
- No single file is a guaranteed merge-conflict point for two parallel workstreams.
- The frontend/backend contract cannot drift silently (generated or CI-checked).
- The scheduled GCP jobs can be deployed by either developer from the CLI, from
  version-controlled config.
- No increase in monthly infrastructure spend (explicitly including any new backend
  runtime host).

---

## Phase 0 — Quick Wins (architecture-independent, do first)

These survive any architecture decision and should be done regardless. **Sequence
these before the collaborator is active; none of them are blocked on CR-101.**

### CR-003: Secure `app/api/picks/route.ts`
**Type**: Security / Bug
**Priority**: Critical (effectively #1 — do first)
**Story Points**: 2
**Timeline**: 1 day
**Status**: Proposed

**User Story**: As a league member, I want pick submission to be authenticated so
that no one can submit picks on my behalf.

**Description**: This route has no auth check — it trusts a client-supplied
`userId` in the request body/query. It also bypasses the shared
`createApiResponse` / `verifyAuthToken` helpers used by other routes, so it's the
wrong pattern for a newcomer to copy.

**Acceptance Criteria**:
- AC1: Route verifies the JWT and derives the user identity server-side
- AC2: Client-supplied `userId` is no longer trusted for authorization
- AC3: Route uses `verifyAuthToken` and `createApiResponse` like sibling routes
- AC4: There is no server-side path to submit a pick as another user

**Cost Considerations**: None (code-only).
**Re-eval note:** Language-agnostic security bug. Unchanged by the collaborator
profile and independent of any FE/BE split. Highest-priority item in the epic.

---

### CR-002: Add CI Pipeline
**Type**: Tech Debt / Tooling
**Priority**: High
**Story Points**: 3 (→ 5 if built polyglot up front)
**Timeline**: 1 day
**Status**: Proposed

**User Story**: As a collaborator, I want PRs to be automatically checked so that a
type error or broken test can't silently merge.

**Description**: There is no CI, and `next.config.mjs` sets both
`typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true`, so
`npm run build` passes even with type/lint errors. With two people, this is the
single biggest hidden risk.

**Acceptance Criteria**:
- AC1: GitHub Actions workflow runs on every PR
- AC2: Runs `tsc --noEmit`, `npm run lint`, and `npm test`
- AC3: Failing checks block merge
- AC4: Workflow completes well within free-tier minutes (lean, cached deps)
- **AC5 (new): Build the workflow path-aware from day one** so a future Python
  backend adds a `pytest` + `mypy`/`ruff` job without a rewrite. Even if the backend
  doesn't exist yet, structure the workflow so `web/**` and `api/**` (or equivalent)
  trigger their own jobs.

**Cost Considerations**: GitHub Actions free tier is ample for this repo's PR
volume. Cache dependencies to keep minutes low. No paid runners.
**Re-eval note:** Priority unchanged (still do-first). Scope nudged: with a likely
polyglot future, structure CI to be path-aware now rather than TS-only, so it isn't
rebuilt when the Python backend lands.

---

### CR-004: Codify GCP Scheduled-Job Deployment
**Type**: Tooling / Infra
**Priority**: High
**Story Points**: 5
**Timeline**: 2-3 days
**Status**: Proposed

**User Story**: As either developer, I want to deploy the scheduled backend-update
jobs from the CLI using version-controlled config, so that I'm not manually copying
scripts to the cloud.

**Description**: The scoring (`*/15`) and game-update (`0 */3`) jobs currently run
in GCP but are deployed by manually copying scripts up. The cadence, target
endpoints, and job definitions live only in the console. This is the least
collaborator-friendly part of the system — a second person literally cannot see or
change it.

**Acceptance Criteria**:
- AC1: A checked-in deploy script (e.g. `deploy/gcp-jobs.sh` or a Makefile target)
  runs the `gcloud` commands to create/update the scheduled jobs + function/runner
- AC2: Cadence and target URLs are defined in version control, not the console
- AC3: `scripts/README.md` documents how to deploy and what each job does
- AC4: Either developer can deploy from a clean checkout given the right creds
- AC5 (stretch): deployment can be triggered from CI on merge to `main`

**Cost Considerations**: **Explicitly verify the job cadence stays within Cloud
Scheduler / function free-invocation limits** — do not tighten cadence beyond what
game data requires. Document the expected monthly invocation count. No new paid
services; reuse the existing GCP project.

**Open questions for scoping** (needed before work starts): GCP project + region;
is the runner a Cloud Function (gen1/gen2) or Cloud Run; current Scheduler job
definitions (target URLs + cadence).
**Re-eval note:** Priority unchanged. New interaction with DEC-1: these scheduled
jobs are already a de-facto separate backend pinging endpoints — they are the
cleanest seam to pilot a Python backend, so this ticket may double as the first
FE/BE-separation experiment.

---

### CR-005: Realistic Sandbox / Test League
**Type**: Tooling / Developer Experience
**Priority**: High
**Story Points**: 5
**Timeline**: 2-3 days
**Status**: Proposed

**User Story**: As a developer, I want a sandbox league tied to a real, current
season so that I can simulate real events (game results, scoring, eliminations,
pick locking) while testing.

**Description**: A test league exists today but was built on a non-existent season,
which made it hard to simulate real events. We need a reproducible seed for a
sandbox league that mirrors real-world conditions closely enough to exercise the
full lifecycle (upcoming games, in-progress games, finished games, week
transitions, strikes, elimination).

**Acceptance Criteria**:
- AC1: A seed script (npm-scripted) creates a sandbox league on a real/current
  season with realistic fixtures and members
- AC2: The seed produces games in multiple states (upcoming, live, final) so pick
  locking and scoring can both be exercised
- AC3: A documented way to advance/simulate events (e.g. set a game final with a
  score and trigger scoring) without waiting for real matches
- AC4: The sandbox is clearly isolated from real leagues and safe to reset
- AC5: README documents how to create and reset the sandbox

**Cost Considerations**: Must run against the existing local/dev database — **no
separate paid environment**. Reuse existing scripts (`init-db.ts`,
`create-epl-league.ts`, `import-epl-2025-fixtures.ts`) rather than adding infra.
Note the existing `clone-prod-to-dev.ts` touches the real prod cluster; the sandbox
seed must NOT depend on prod access.
**Re-eval note:** Priority reinforced (if anything, higher value now). Beyond
onboarding, this sandbox is the testbed against which any FE/BE-separation or Python
backend experiment (CR-101) gets validated.

---

### CR-006: Fix Scripts Tooling & Docs
**Type**: Tech Debt / Docs
**Priority**: Medium → Medium-Low
**Story Points**: 2
**Timeline**: 1 day
**Status**: Proposed

**User Story**: As a new developer, I want the operational scripts to be documented
and runnable so I don't run the wrong thing against the wrong environment.

**Description**: The `calculate-scores` npm script points at `scripts/calculate-scores.ts`
but the file is `.js` (the command fails as written). `backfill-external-ids.ts` and
`clone-prod-to-dev.ts` are undocumented in `scripts/README.md` — the latter connects
to the **real prod cluster**.

**Acceptance Criteria**:
- AC1: Fix the `calculate-scores` npm script path
- AC2: Add npm scripts for `init-db`, `create-epl-league`, `import-epl-2025-fixtures`
- AC3: Document all 10 scripts in `scripts/README.md`
- AC4: Explicitly flag which scripts are destructive and/or touch prod

**Cost Considerations**: None (docs + config).
**Re-eval note:** Slightly downgraded. If the backend/data scripts are later ported
to Python (CR-101), heavy documentation of the current TS scripts is lower-ROI. The
safety flags in AC4 (destructive / prod-touching) remain valuable regardless of
language — keep those even if the rest is deferred.

---

## Phase 1 — Safety Net Tests (mostly architecture-independent)

### CR-008: Test `lib/auth-utils.ts`
**Type**: Test Coverage / Security
**Priority**: High
**Story Points**: 3
**Timeline**: 1-2 days
**Status**: Proposed

**Description**: `validateAdminPermission` and `verifyLeagueMembership` are
security-critical and have zero coverage.

**Acceptance Criteria**:
- AC1: Tests for admin-permission and league-membership authorization paths
- AC2: Negative cases (non-member, non-admin, invalid token) covered

**Cost Considerations**: None.
**Re-eval note:** Kept at High. JWT/cookie auth is the piece most likely to *stay*
in the Next.js layer even under a FE/BE split, so these tests won't be thrown away —
this is why CR-008 survives where CR-007 (below) is now held.

---

### CR-007: Test `lib/game-utils.ts`
**Type**: Test Coverage
**Priority**: High → **Hold / reframe** (sequence after CR-101)
**Story Points**: 3
**Timeline**: 1-2 days
**Status**: Proposed (on hold pending CR-101)

**Description**: `game-utils.ts` holds the single source of truth for game status
and pick-lock rules (`computeGameStatus`, `hasGameweekStarted`, `arePicksLocked`,
`canChangeExistingPick`) and has zero tests. Pure functions — no mocking needed.

**Acceptance Criteria**:
- AC1: Unit tests for all exported pure functions
- AC2: Edge cases covered (week 0, missing/empty fields, boundary times)
- AC3: Tests run in existing Jest setup
- **AC4 (new): If written before CR-101 resolves, write them as portable behavioral
  specs** (table-driven input→expected) so they can be ported to `pytest` if this
  logic moves to a Python backend.

**Cost Considerations**: None.
**Re-eval note:** Downgraded from "highest test ROI in the repo" to hold. That
framing assumed the logic stays in TypeScript. Pick-lock / game-status rules are
prime candidates to move into a Python backend (they sit right next to scoring), so
exhaustive TS-coupled tests risk being throwaway. Either sequence after the CR-101
decision, or write them as language-portable specs (AC4).

---

## Phase 2 — Architecture Spike (the big decision — replaces the old SQL phase)

The old Phase 2 framed the decision as "MongoDB vs SQL." The real fork, given the
collaborator profile, is **"FE/BE split + Python/FastAPI backend + Pydantic
contracts, staying on MongoDB" vs. "stay a TypeScript monolith."** CR-101 is
reframed accordingly and is now the gate for everything DB/backend-adjacent.

### CR-101 / CR-EVAL: Architecture & Backend-Language Spike
**Type**: Spike / Decision
**Priority**: High
**Story Points**: 5
**Timeline**: 2-3 days
**Status**: Proposed

**User Story**: As the team, we want a cost + effort assessment of separating the
frontend and backend with a Python backend and typed contracts (keeping MongoDB), so
we can make a go/no-go decision before committing.

**Description**: Evaluate the coherent direction described in "Architecture
Direction Under Evaluation" above: FE/BE separation, a Python (FastAPI) backend
owning scoring/ingestion/data jobs, Pydantic contracts, and **retaining MongoDB**
(motor/pymongo). Compare against staying a TypeScript monolith. DB access is already
centralized in `lib/db.ts`, which bounds the migration surface either way.

**Acceptance Criteria**:
- AC1: **Cost analysis** — hosting a second (Python) runtime at/near $0 (Cloud Run
  scale-to-zero in the existing GCP project, or Fly/Render/Railway free tier) vs.
  today's spend. Must be cost-neutral or the delta explicitly justified. **This is
  the primary axis** — a second runtime is the biggest cost risk in the epic.
  Include the **single-dyno packaging idea** (Python backend serving compiled static
  frontend assets on one Heroku app — see "Deployment packaging idea" above) as a
  cost-reducing option to evaluate against two-process topologies.
- AC2: **Repo topology recommendation** — monorepo (`apps/web` + `apps/api`, or an
  `api/` dir) vs. two repos, using the feasibility analysis above. Default to
  monorepo unless a specific reason forces separation.
- AC3: **Contract mechanism** — Pydantic → OpenAPI → generated TS types, vs.
  hand-written `types/` with a CI drift check. Recommend one.
- AC4: **Effort estimate** — porting scoring/game logic and the `lib/db.ts` access
  layer to Python; what stays in the Next.js layer (auth/session almost certainly
  does); how the scheduled jobs (CR-004) fold in.
- AC5: **DB decision** — confirm MongoDB stays (DEC-2 lean no-go) or surface a
  concrete reason to revisit SQL; if staying, note the Pydantic guardrail as the
  drift mitigation.
- AC6: **What this unblocks / invalidates** — its effect on CR-103, CR-104, CR-007,
  and whether the old CR-102 (SQL migration) is formally closed.
- AC7: **Go/no-go recommendation** with a phased path if go (e.g. pilot the Python
  backend on the scheduled jobs first, per DEC-3).

**Cost Considerations**: The evaluation's primary axis. A Python backend must be
hostable at/near $0; if no free-tier fit exists that's a strong argument to stay a
TS monolith and get the typed-contract benefit via TS-only means instead.

---

### CR-103: Consolidate Duplicated Scoring / Elimination Logic
**Type**: Tech Debt / Correctness
**Priority**: Medium
**Story Points**: 5
**Timeline**: 2-3 days
**Status**: Proposed
**Blocked by / coordinated with**: CR-101 (target language depends on the decision)

**Description**: Survivor scoring/elimination is implemented twice — `lib/scoring.ts`
(`calculateScoresAndStrikes`) and `db.ts::getSeasonSummary` — as separate week-by-week
loops encoding the same rules (win=3, draw=1, loss/missing=strike; elimination at
`strikes >= 2`). They can silently drift. Extract one shared pure function, name the
magic numbers as constants, and test it.

**Acceptance Criteria**:
- AC1: Single shared function for per-week points/strikes/elimination
- AC2: `win=3 / draw=1`, `strikes >= 2` expressed as named constants
- AC3: Unit tests for the shared function
- AC4: Both call sites use it
- AC5: Opportunistically group the extracted scoring logic under `lib/scoring/`
  (TS) or a single scoring module in the Python backend — no standalone folder reorg.

**Cost Considerations**: None.
**Re-eval note:** Shape now depends on CR-101. If scoring moves to a Python backend,
consolidate it **directly in Python** — consolidating in TS first and then porting
means doing the work twice. Still worth doing (real drift risk); just do it once, in
the target language, after the CR-101 call. The single-home requirement also protects
against DEC-1's "split scoring across a language boundary" cost.

---

### CR-104: Rewrite README Backend Section
**Type**: Docs
**Priority**: Medium
**Story Points**: 3
**Timeline**: 1 day
**Status**: Proposed
**Coordinated with**: CR-101 (rewrite once, after the architecture direction is set)

**Description**: The 697-line README still documents a **Django REST API backend**
with detailed endpoint specs that no longer exist — the app migrated to Next.js API
routes + MongoDB. This is the most misleading onboarding document in the repo.

**Acceptance Criteria**:
- AC1: Backend section reflects the actual architecture (Next.js API routes +
  current DB, or the split FE/Python-BE topology if CR-101 is a go)
- AC2: Obsolete Django endpoint specs removed
- AC3: Local setup path (env, seed sandbox, run) is accurate end-to-end — including
  running the backend if it's a separate app

**Cost Considerations**: None.
**Re-eval note:** Unchanged logic (write once, after the direction is decided) but
now gated on the *broader* architecture decision, not just the DB choice.

---

### CR-102: Execute SQL Migration — **CLOSED / WON'T-DO (pending CR-101)**
**Type**: Migration
**Priority**: Deprioritized (was TBD, ~21 pts)
**Status**: Closed pending CR-101 — retained here for the record

**Re-eval note:** Following DEC-2. The SQL migration's core benefit — a typed schema
as a two-dev guardrail — is undercut by a SQL-light collaborator, and the same
guardrail is available via Pydantic on MongoDB (DEC-4) at zero migration cost. This
~21-point migration is removed from the active plan. Reopen only if CR-101 surfaces
a concrete reason SQL is required.

---

## Phase 3 — Reorg for Parallelization (do as workstreams demand)

These are all **frontend** concerns; a FE/BE split leaves them squarely in the
frontend and does not change their priority.

### CR-201: Split God-Components (`admin/page.tsx`, `make-picks/page.tsx`)
**Type**: Refactor
**Priority**: Medium
**Story Points**: 13
**Timeline**: 1-2 weeks
**Status**: Proposed

**Description**: `app/admin/page.tsx` (~865 lines) holds overview/members/invitations/
settings in one component + state block — a guaranteed merge-conflict magnet.
`app/make-picks/page.tsx` (~574 lines) bundles picks-remaining, lock logic, and modal
UI. Split by concern into components/hooks (`useAdminMembers`, `useAdminInvitations`,
`usePickSubmission`). **Do the admin split only if both devs will actually work in
admin** — don't refactor speculatively.

**Acceptance Criteria**:
- AC1: Admin tabs split into separate components/hooks
- AC2: make-picks split into submission hook + presentational pieces
- AC3: No behavior change; guarded by CI

**Cost Considerations**: None.
**Re-eval note:** Unchanged. Purely frontend; unaffected by language or DB choice.

---

### CR-202: Consolidate Route Guards & Clean Debug Output
**Type**: Refactor
**Priority**: Low
**Story Points**: 2
**Timeline**: 1 day
**Status**: Proposed

**Description**: `components/admin-guard.tsx` and `league-guard.tsx` are ~90%
duplicate auth/redirect logic; `admin-guard.tsx` has leftover `console.log`
statements in production code. Consolidate into one guard/shared hook.

**Acceptance Criteria**:
- AC1: Shared guard logic; no duplication
- AC2: `console.log` debug output removed
- AC3: Both admin and league protection still work

**Cost Considerations**: None.
**Re-eval note:** Unchanged. Frontend-only.

---

### CR-203: Onboarding Documentation Hygiene
**Type**: Docs
**Priority**: Low
**Story Points**: 2
**Timeline**: 1 day
**Status**: Proposed

**Description**: Small legibility fixes for a newcomer: (a) add a `**Status**` field
to the ~10 tickets missing one so done-vs-backlog is clear; (b) note in `CLAUDE.md`
that `components/ui/` is ~43 files of unmodified shadcn boilerplate (only ~8 carry
the retro theme) and that real feature UI lives in `app/*/page.tsx`.

**Acceptance Criteria**:
- AC1: All tickets carry a status field
- AC2: CLAUDE.md documents the components/ layout + where feature UI lives

**Cost Considerations**: None.
**Re-eval note:** Unchanged. If CR-101 lands on a split repo topology, also document
the `apps/web` + `apps/api` (or `api/`) layout here.

---

## Latent Bugs Surfaced During Review (track separately)

Not onboarding issues per se, but found during the survey — worth their own tickets:

- **No server-side team-reuse validation.** UI implies teams can be picked ≤2×/season,
  but `createPick` (`db.ts`) only checks timing/locking — `isTeamUsed` is a UI flag
  only. A crafted request bypasses the rule.
- **`game-updater.ts::findMatchingDatabaseGame` throws hard** on any missing
  `externalId`, so a malformed external-API response can crash the whole scheduled
  update job.

---

## Recommended Sequencing

1. **Phase 0** (before the collaborator is active): CR-003 first (security), then
   CR-002, CR-004, CR-005, CR-006 — these make the repo safe, honest, and testable,
   and give a realistic sandbox to work in. All are architecture-independent.
2. **Phase 1** alongside onboarding: CR-008 now; **CR-007 held** until CR-101
   resolves (or written as portable specs) since its logic may move to Python.
3. **Phase 2**: run **CR-101 early** — it now gates the entire backend/DB direction
   (Python FE/BE split + Pydantic + Mongo, vs. TS monolith). Its output unblocks
   CR-103/104 and formally closes or reopens CR-102 (SQL).
4. **Phase 3**: frontend reorg (CR-201) only where the two of you actually work in
   parallel.

## Epic Dependencies
- GCP project/region + current Scheduler job definitions (for CR-004)
- **CR-101 architecture go/no-go** before CR-103/104 and before closing CR-102
- Confirmation of current MongoDB Atlas spend (baseline for the cost constraint)
- If CR-101 is a go: a free-tier host for the Python backend (baseline for the cost
  constraint on the new runtime)

## Definition of Done
- [ ] Phase 0 quick wins merged; CI green on every PR (path-aware for a future
      polyglot repo)
- [ ] Realistic sandbox league seedable and documented
- [ ] GCP jobs deployable from CLI via checked-in config
- [ ] Safety-net tests (auth-utils now; game-utils per CR-101 outcome) in place
- [ ] CR-101 architecture go/no-go decided and documented; if go, FE/BE topology,
      backend language, and contract mechanism chosen — and cost-neutral
- [ ] Frontend/backend contract cannot drift silently (generated or CI-checked)
- [ ] README + CLAUDE.md accurate for a fresh clone (single-clone monorepo if split)
- [ ] No increase in monthly infrastructure cost (including any new backend runtime)
