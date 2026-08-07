# CR-106: Frontend Static Export + Single Heroku Dyno Cutover

**Ticket ID**: CR-106
**Title**: Export Next.js as static assets, serve from the Python API on one Heroku dyno
**Type**: Migration / Infra
**Priority**: Critical — blocks go-live (~Aug 13-16) and season start (~Aug 20)
**Story Points**: 8 (rough; AC4 and AC5 are the unknowns)
**Status**: Proposed
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

**AC1 — `next.config.mjs`**
- Add `output: 'export'`
- `images.unoptimized: true` (Image Optimization needs a running server; export mode
  requires this or a custom loader)
- Remove `async headers()` — not supported under `output: 'export'`; superseded by
  AC6
- Add `trailingSlash: true` so exported output maps cleanly to directory-style URLs
  a static-file server can serve

**AC2 — Delete `app/api/*`**
Not optional cleanup — Route Handlers require a server and the build will hard-fail
under `output: 'export'` if any remain. Gate this on confirming Python parity for
every route currently under `app/api/` (expected to already be true per CR-105, but
verify route-by-route before deleting, not after).

**AC3 — Delete `middleware.ts`**
Doesn't run under static export (no server to run it on). Its job — blocking
unauthenticated `/api/*` calls — is already duplicated in `auth_deps.py`.

**AC4 — Resolve the five dynamic path-param pages** (the real unknown in this
ticket)
`app/invite/[token]`, `app/reset-password/[token]`, `app/player/[id]`,
`app/admin/members/[id]`, `app/admin/requests/[id]`. Static export requires every
dynamic segment resolvable at build time via `generateStaticParams()` — impossible
here since tokens/ids don't exist until runtime, and none of the five implement it
today. As-is, the build fails as soon as AC1 lands. Pick one pattern, apply to all
five:
1. **Query-string routes** (`/invite?token=...`) — least code, but breaks any
   already-issued path-style link.
2. **Keep path URLs**, ship one static shell per route, add a FastAPI catch-all that
   serves that shell for any sub-path, page reads the id from
   `usePathname()`/`window.location` instead of Next's route param.

**Open question, answer before starting**: are any invite or password-reset links
already circulating (sent via email, etc.)? If yes → option 2. If the answer is no
for all five routes, option 1 is simpler and fine.

**AC5 — Heroku build & runtime**
- Multi-buildpack: Node (runs `npm run build` → `out/`) then Python (runs FastAPI).
- `Procfile`: `web: npm start` → something that runs `uvicorn app.main:app` from
  `api/`.
- FastAPI: `StaticFiles` mount serving `out/`, registered **after** the API routers
  so `/api/*` still matches first, plus a catch-all fallback for direct-URL loads
  and client-side navigation.
- Glue step to get the Node-built `out/` directory into a place the Python process
  can read at runtime (buildpacks build in separate steps by default) — likely a
  `bin/post_compile` script or equivalent. **Dry-run on a Heroku review app before
  touching prod.**
- Any frontend env var baked at build time must be a Heroku config var at *build*
  time, not just runtime, since static export bakes it into the JS bundle. Currently
  only `NEXTAUTH_URL` (via `next.config.mjs`'s `env` block) — confirm during
  implementation whether this is actually used anywhere (app's auth is custom
  JWT/cookie, not NextAuth; this may be vestigial and safe to drop).

**AC6 — Security headers**
Move `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` (currently set
via Next's `headers()`, removed in AC1) into a small ASGI middleware in
`api/app/main.py`, applied to both API responses and served static assets.

**AC7 — Fix the team-reuse validation gap before cutover goes live**
`api/app/db/picks.py::create_pick` fixed the draw-scoring bug during the CR-105 port
but still carries forward the same gap as the original TS code: no server-side check
that a team hasn't already been picked twice this season (`isTeamUsed` is UI-only).
Low priority in the abstract, but once this Python path is what's actually live for
real picks, it's the same integrity gap the auth fix (already done in this router)
was meant to close. Fix it here, in Python, not TS.

**AC8 — Real browser-based end-to-end verification, not curl**
Everything on the Python side has only been verified via `curl` so far (per the
CR-105 Phase 2 report). Before this goes live: full browser walkthrough of
login → cookie persists across reload → protected route redirect works →
logout clears cookie → make a pick → admin toggles paid/unpaid.

## Cost Considerations

Net cost reduction vs. a two-dyno split (one Heroku dyno instead of two). No new
paid services. Consistent with the epic's cost constraint.

## Dependencies

- CR-105 Phases 1-2 (done — Pydantic models, db layer, all routers ported)
- AC4's pattern choice depends on checking whether any invite/reset-password links
  are already live
- Should get a cross-reference added from `CR-105-*` docs and
  `COLLABORATION_READINESS_EPIC.md`'s "Deployment packaging idea" section once this
  is picked up, since both currently point here as unresolved

## Timeline

Blocks go-live and season start — needs to land before both.
