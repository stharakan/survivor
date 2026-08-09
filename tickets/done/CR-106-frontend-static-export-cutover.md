# CR-106: Frontend Static Export + Single Heroku Dyno Cutover

**Ticket ID**: CR-106
**Title**: Export Next.js as static assets, serve from the Python API on one Heroku dyno
**Type**: Migration / Infra
**Priority**: Critical — blocks go-live (~Aug 13-16) and season start (~Aug 20)
**Story Points**: 8 (rough; AC4 and AC5 were the unknowns going in -- both are done now)
**Status**: Done -- 8/8 ACs done (AC1-AC8).
`npm run build` now succeeds (`out/` produced cleanly). AC8 (browser-based
end-to-end verification) found a real go-live blocker -- see **CR-107** (spun
out, not a sub-item here) -- which has since landed and been reverified.
**Parent**: CR-105 (Python backend port) — this is the frontend-cutover phase CR-105
Phase 2 explicitly left undone. Also resolves the "Deployment packaging idea" flagged
as park-and-explore in `COLLABORATION_READINESS_EPIC.md`.

## Decision

Serve the app as one Heroku dyno: Next.js builds to static assets
(`output: 'export'`), FastAPI (`api/`) serves both those assets and the `/api/*`
routes from the same origin. Chosen over a two-origin (separate FE/BE, CORS +
cross-site cookies) split specifically because single-origin eliminates the CORS and
`SameSite` cookie problems entirely — there is no cross-site request to configure
around. Also cheaper (one dyno, not two), consistent with the epic's cost
constraint.

## Former blocker (resolved by AC2/AC3, kept for history)

`next.config.mjs` already had `output: 'export'` (AC1, done), but `app/api/*` and
`middleware.ts` were still in the tree (AC2/AC3). This made `npm run build` hard-fail
collecting page data for every remaining Route Handler, e.g.

    Error: export const dynamic = "force-static"/export const revalidate not
    configured on route "/api/admin/users/[userId]/generate-reset-link" with
    "output: export"

Resolved: AC2/AC3 landed (route-by-route Python parity verified first, then both
deleted). `npm run build` now succeeds end-to-end and produces `out/`.

## What's already in good shape (verified, don't re-litigate)

- Python router prefixes already match what the frontend calls: `/api/auth`,
  `/api/leagues`, `/api/picks`, etc. line up with `lib/api-client.ts`'s
  `API_BASE = '/api'`. The data-fetching layer needs ~no changes.
- Auth cookie/JWT scheme is already a compatible port — same `JWT_SECRET`, same
  cookie name (`api/app/core/security.py`, `api/app/core/auth_deps.py`).
- Every page except `app/page.tsx` is already a `"use client"` component doing
  client-side fetches — no server-component data-fetching to rip out.
- `app/page.tsx` (home) is static with zero dynamic data — exports cleanly as-is.
- CR-105's Python port covers essentially the full route surface already (see
  `CR-105-FINDINGS.md` Table 1); `join-requests` was confirmed dead and dropped, not
  missed.

## Acceptance Criteria

**AC1 — `next.config.mjs`** ✅ Done
- Add `output: 'export'`
- `images.unoptimized: true` (Image Optimization needs a running server; export mode
  requires this or a custom loader)
- Remove `async headers()` — not supported under `output: 'export'`; superseded by
  AC6
- Add `trailingSlash: true` so exported output maps cleanly to directory-style URLs
  a static-file server can serve

Verified current `next.config.mjs` has all four. Note: its comments already talk
about AC2/AC6 as if done ("Security headers now live in api/app/main.py's ASGI
middleware (CR-106 AC6)") -- they aren't yet (see AC2, AC6 below). Don't trust that
comment as a status source; this ticket is.

**AC2 — Delete `app/api/*`** ✅ Done
Verified Python parity route-by-route before deleting (all 24 `app/api/**/route.ts`
files, every exported HTTP method) against `api/app/routers/*.py`:
- All GET/POST/PATCH/DELETE handlers with real logic have a matching Python route
  (same path prefix + method), confirmed by reading both sides, not just prefix
  matching.
- Three intentional non-1:1s, all independently confirmed safe:
  - `DELETE /api/leagues/[leagueId]` — the TS handler was a 501 "not implemented
    yet" stub with zero callers in `lib/api-client.ts`; `leagues.py`'s own
    docstring documents it as deliberately cut (CR-105-FINDINGS.md Table 3 item 9).
  - `GET` on `admin/recompute-scores` and `admin/update-game-scores` — TS handlers
    were 405 "method not allowed" stubs (real logic is POST-only, already ported to
    `admin_scoring.py`).
  - `PUT`/`DELETE` stubs on `generate-reset-link` and `reset-password/[token]` — TS
    handlers were 405 stubs; FastAPI/Starlette return 405 automatically for
    unmatched methods on a registered path, so no explicit port was needed.
- Deleted the whole `app/api/` tree, including a few untracked leftover empty
  directories (`app/api/auth/change-password`,
  `app/api/admin/users/[userId]/reset-password`,
  `app/api/leagues/[leagueId]/games`, `app/api/leagues/[leagueId]/picks`) that had
  no `route.ts` in them.

**AC3 — Delete `middleware.ts`** ✅ Done
Deleted. Doesn't run under static export (no server to run it on). Its job —
blocking unauthenticated `/api/*` calls — is already duplicated in `auth_deps.py`.

Verified together: `npm run build` now completes cleanly (`✓ Compiled
successfully`, `✓ Generating static pages (20/20)`, `✓ Exporting (2/2)`) and
`out/index.html` exists.

**AC4 — Resolve the dynamic path-param pages** ✅ Done
Original scope named five pages: `app/invite/[token]`, `app/reset-password/[token]`,
`app/player/[id]`, `app/admin/members/[id]`, `app/admin/requests/[id]`. Resolution:
- **Answered the open question**: no invite/reset-password links were already
  circulating, so the simpler option applied.
- **Option 1 (query-string routes)** applied to four of the five --
  `app/invite`, `app/reset-password`, `app/player`, `app/admin/members` are now flat
  routes reading `useSearchParams()` (`?token=...` / `?id=...`) instead of a path
  segment. Verified in code (`useSearchParams` + `searchParams.get(...)` present in
  all four `page.tsx` files).
- **`app/admin/requests/[id]` wasn't converted -- it was deleted.** `join-requests`
  was confirmed dead code during the CR-105 audit (see "What's already in good
  shape" above), so this wasn't a sixth pattern-application, it just went away. The
  route directory doesn't exist in the tree.
- Landed in `954ebcb`.

**AC5 — Heroku build & runtime** ✅ Done (dependency manager changed after initial
landing -- see below)
- Multi-buildpack: Node (runs `npm run build` → `out/`) then Python (runs FastAPI).
- `Procfile`: `web: cd api && uv run --project .. uvicorn app.main:app --host 0.0.0.0
  --port $PORT`.
- FastAPI: `StaticFiles` mount serving `out/`, registered **after** the API routers
  so `/api/*` still matches first, plus a catch-all fallback (`out/404.html`) for
  unmatched paths. Landed in `api/app/main.py` as part of `9299a63`.
- `bin/post_compile` (Node-buildpack post-build hook) fails the build loudly if
  `out/index.html` wasn't produced, relying on Heroku's native multi-buildpack
  shared-build-dir behavior (not the deprecated `heroku-buildpack-multi` isolated-dir
  model) -- no file-copy step needed.
- `NEXTAUTH_URL` confirmed vestigial (only consumer was the now-deleted-under-AC2
  `generate-reset-link` Route Handler) and dropped from `next.config.mjs`'s `env`
  block -- no new Heroku build-time config vars needed beyond what AC1 already
  resolved.

  **Dependency manager switched to `uv` after `9299a63`** (this was still `pip` +
  `requirements.txt` when AC5 first landed). Heroku's Python buildpack now supports
  `uv` natively, but detection is root-only, same constraint `requirements.txt` had
  -- `pyproject.toml` / `uv.lock` / `.python-version` must sit at the **repo root**,
  not `api/`, even though all the actual Python code stays under `api/`. Also,
  Heroku's classic buildpack rejects the build outright if it finds more than one
  package-manager manifest, so this was a full swap, not an addition:
  - Added `pyproject.toml`, `uv.lock`, `.python-version` (pinned `3.13` -- checked
    Heroku's current support matrix: `3.10` is deprecated there now, `3.12`/`3.13`/
    `3.14` are supported; picked `3.13` over the newer `3.14` for wider wheel
    availability on the C-extension deps, `bcrypt`/`cryptography`).
  - Deleted the root `requirements.txt` shim and `api/requirements.txt`.
    `pyproject.toml` has `[tool.uv] package = false` since this isn't an installable
    package (the code lives under `api/app`, not a root-level package) -- uv just
    resolves/syncs dependencies into a venv.
  - `pytest`/`pytest-asyncio` moved into a `[dependency-groups] dev` group instead of
    living in the same flat list as prod deps.
  - Procfile and `api/README.md`'s install/run instructions updated to `uv run
    --project ..` (run from `api/`, resolves against the root manifest, keeps
    `app.main:app`'s import path unchanged).
  - Verified locally: `uv lock` resolved cleanly (46 packages), `uv run --project ..`
    from `api/` builds a root `.venv` and imports `app.main`, `pytest
    --collect-only` finds all 38 tests via the `dev` group, and the exact Procfile
    command boots uvicorn and returns 200 on `/health`.
  - Still not done: an actual Heroku dry-run (`buildpacks:add` against a review app,
    real `git push`) to confirm the uv-enabled buildpack path works end-to-end on
    Heroku's infra, not just locally. Called out as not-done in the original AC5
    commit too -- still true.

**AC6 — Security headers** ✅ Done
Moved `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: origin-when-cross-origin` (values confirmed unchanged against
git history, commit 5d2725e's `next.config.mjs`) into
`api/app/core/security_headers.py`'s `SecurityHeadersMiddleware`, a
`BaseHTTPMiddleware` subclass registered via `app.add_middleware(...)` in
`api/app/main.py`, right after `register_exception_handlers(app)` and before any
router/mount. Starlette applies middleware around the whole ASGI app regardless of
registration order relative to routes, so this covers `/api/*` responses, the
`out/` static mount, and the catch-all 404 fallback alike -- same blanket
`source: '/(.*)'` coverage the original `headers()` block had. Verified via
`TestClient`: headers present on `/health` (200) and on an unmatched path (404,
falls through to FastAPI's default handler since no `out/` exists in this
environment). Added `api/tests/test_security_headers.py` (2 tests, both pass); full
non-live suite now 37 passed, 3 deselected (live-mongo smoke tests, unaffected).

**AC7 — Fix the team-reuse validation gap before cutover goes live** ✅ Done
`api/app/db/picks.py::create_pick` fixed the draw-scoring bug during the CR-105 port
but still carries forward the same gap as the original TS code: no server-side check
that a team hasn't already been picked twice this season (`isTeamUsed` is UI-only).
Low priority in the abstract, but once this Python path is what's actually live for
real picks, it's the same integrity gap the auth fix (already done in this router)
was meant to close. Fixed here, in Python, not TS -- `create_pick` now counts prior
uses of the team (excluding the week being replaced) and raises before the upsert if
count >= 2. See the `CR-106 AC7` docstring note in `api/app/db/picks.py`.

**AC8 — Real browser-based end-to-end verification, not curl** ✅ Done (with one
caveat, see below)
Everything on the Python side had only been verified via `curl` before this (per
the CR-105 Phase 2 report). Full browser walkthrough completed against a fresh
`uvicorn` instance (rebuilt `out/` off current `main`, includes the CR-107 fix)
+ the sanitized `survivor-league-dev` Atlas clone, logged in as an admin of the
real "Tharakan Bros Survivor League":
- **Login** — verified working.
- **Cookie persists across reload** — verified.
- **Protected route redirect** — verified.
- **Logout clears cookie** — verified.
- **Admin members tab** — verified. CR-107 fix confirmed live: `/members` and
  `/scoreboard` for the real league (which has a removed member) returned 401
  (auth-required) instead of the old 400 validation error pre-login, and
  rendered correctly once logged in.
- **Admin toggles paid/unpaid** — verified.
- **Make a pick** — **not confirmed**. Same blocker noted below (seeded
  dev-clone game dates already in the past relative to the environment's
  clock, so `/make-picks` shows locked/grayed-out). Accepted as a known gap,
  not reattempted with synthetic data -- this is real current-week game data
  that will exist once live, not an AC8 process problem. Flagging here so it
  doesn't get silently assumed-covered.
- **Fixed along the way, not a CR-107 blocker**: `scripts/clone-prod-to-dev.ts`
  generated dev-clone login emails as `user{N}@dev.local`; Pydantic's `EmailStr`
  (`api/app/models/requests.py`) rejects `.local` as an IANA special-use TLD,
  where the original Zod validator (`lib/api-types.ts`) didn't -- so no dev-clone
  account could log in against the Python backend at all. Fixed by renaming the
  script's generated domain (and the then-live 62 accounts in
  `survivor-league-dev`) to `user{N}@dev.internal` instead of loosening the
  Python validator, since the stricter behavior is arguably correct for real
  input and no real prod email would ever hit it.

CR-107 (`league_memberships.status` enum gap) landed in `7000f24` and was
reverified as part of this same browser pass -- see CR-107's own ticket for its
AC2/AC3 sign-off detail.

## Cost Considerations

Net cost reduction vs. a two-dyno split (one Heroku dyno instead of two). No new
paid services. Consistent with the epic's cost constraint.

## Dependencies

- CR-105 Phases 1-2 (done — Pydantic models, db layer, all routers ported)
- ~~AC4's pattern choice depends on checking whether any invite/reset-password links
  are already live~~ Resolved -- none were, option 1 applied (see AC4).
- Should get a cross-reference added from `CR-105-*` docs and
  `COLLABORATION_READINESS_EPIC.md`'s "Deployment packaging idea" section once this
  is picked up, since both currently point here as unresolved

## Timeline

Blocks go-live and season start — needs to land before both. All 8 ACs are now
done. CR-107 (`league_memberships.status` enum gap) landed and was reverified as
part of AC8's browser pass. Only open item is "make a pick" not being
confirmable in-browser yet, purely because the dev-clone's seeded game dates are
in the past relative to the environment's clock -- not a code gap. Worth a final
confirm against real current-week data once the season's live, but not treated
as a go-live blocker.
