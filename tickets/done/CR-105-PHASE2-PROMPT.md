# CR-105 Phase 2 kickoff prompt

Paste this into a fresh session to start Phase 2.

---

We're starting Phase 2 of CR-105 (full migration of the Survivor League backend
from Next.js/TS to a Python/FastAPI service in `api/`). Read these three files in
full before doing anything else:

1. `tickets/CR-105-FINDINGS.md` — the audit: port list (Table 1), duplicate list
   (Table 2), cut list (Table 3), Pydantic model list (Table 4), plus **Addendum 2
   at the bottom**, which records decisions made on Phase 1's open items — treat
   Addendum 2 as authoritative over anything it contradicts earlier in the file.
2. `tickets/CR-105-PHASE1-REPORT.md` — what Phase 1 actually shipped (project
   skeleton, all Pydantic models, the full `app/db/` data-access layer). Read the
   "Open-items resolution" section near the end alongside Addendum 2 above.
3. `api/README.md` and skim `api/app/` — the code Phase 1 produced. No routes exist
   yet (`app/main.py` has only `GET /health`); no JWT/auth exists; no port of
   `lib/auth-utils.ts` or `lib/game-utils.ts` exists yet.

## Scope for Phase 2

Build the route layer on top of the Phase 1 `app/db/` functions, in the Rank
1→7 dependency order from Table 1 (auth → leagues → memberships → games → picks →
invitations → scoring/results). For each rank: port the routes, wire JWT
verification (direct verification in FastAPI, no BFF proxy — this was already
decided, see Table 1's intro), and fix the specific known bugs Table 1 calls out
for that rank rather than silently porting them as-is (e.g. missing auth on
`GET /api/games`, `GET /api/users/[userId]/leagues`'s missing ownership check,
`DELETE /api/invitations/[invitationId]`'s "any authenticated user for now" gap).

### Non-negotiable items from Addendum 2 — do not skip these

- **Picks privacy boundary.** `PlayerProfile` (Phase 1, already fixed) has no
  `picks` field — it's a public-within-league shape. The picks endpoint(s) must
  enforce **requester == queried user** (self-only; consider whether a league-admin
  override is wanted, but don't default to open). This is the actual fix for the
  no-auth gap Table 1 item 5.4 named in `app/api/picks/route.ts` and
  `app/api/picks/remaining/route.ts` today — build it as a real authorization
  check, not a convention the frontend happens to follow. `app/player/[id]/page.tsx`
  should only ever call the profile endpoint for another user, never a picks
  endpoint for anyone but the logged-in user.
- **`lib/game-utils.ts` duplicate logic.** Port `computeGameStatus`,
  `canPickFromGame`, `canChangeExistingPick`, `hasGameweekStarted`,
  `arePicksLocked` to Python for server-side pick-lock validation (Table 2 has
  exact `file:line` citations). Before/alongside this port, build the **golden-fixture
  parity test**: a fixed set of `{startTime, status, current_game_week,
  current_pick_week}` inputs, run through both the TS originals and the new Python
  functions, asserting identical booleans. This is required, not optional — it's
  the only thing that keeps these two independently-implemented languages from
  silently drifting on pick-lock timing.
- **Live MongoDB verification.** Phase 1 was never run against a real Mongo
  instance. Before or while building routes on top of `app/db/`, get a Mongo
  instance up (local or Atlas) and actually exercise the data-access functions
  (`get_league_by_id`, `create_pick`, etc.) against real data — don't assume
  Phase 1's `py_compile`-only verification was sufficient.

### Explicitly out of scope for Phase 2

- **Season rollover** (`start_new_season` / `seasonArchive`) — code exists in
  `app/db/leagues.py` from Phase 1, deliberately not wired into any route this
  phase. No season boundary is imminent; revisit later.
- Anything on the cut list (Table 3) — `createGame`, `createGameIndexes`,
  `createInvitationIndexes`, join-request feature, league DELETE. Do not build
  routes for these.
- `initializeDefaultData` / `scripts/init-db.ts` — stays Node/TS dev tooling,
  untouched by this migration.
- `League.sportsLeague` stays a fixed value (`"EPL"`) — don't build a
  multi-sport picker or make it user-selectable.

## Working agreement

- Cite `file:line` for every claim, same as CR-105's prior phases.
- Where you deviate from a Table 1/2/3/4 verdict or fix a bug beyond what's
  explicitly named, flag it in a Phase 2 report the same way Phase 1 did — don't
  silently decide product/scope questions.
- Leave code uncommitted for review unless told otherwise.
- Write a `tickets/CR-105-PHASE2-REPORT.md` when done, following the Phase 1
  report's structure (file list, verification performed, judgment calls flagged,
  what Phase 3 — if any — needs to know).
