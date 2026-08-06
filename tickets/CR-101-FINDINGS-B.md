## AC4 — Migration Surface & Effort

Read-only research spike. All claims cited as `file:line`. No code was changed.

---

### 1. API routes — classification (24 of 24 `route.ts` handlers)

Found via `find app/api -name route.ts` (24 files, confirmed by manual count).

| # | Route | Bucket | Reason (file:line) |
|---|-------|--------|---------------------|
| 1 | `admin/recompute-scores` (POST/GET) | **MOVE-TO-PYTHON** | API-key auth (not cookie/JWT), pure trigger that delegates entirely to `runScoringCalculation()` — `app/api/admin/recompute-scores/route.ts:9-22` (key check), `:37-51` (delegate) |
| 2 | `admin/update-game-scores` (POST/GET) | **MOVE-TO-PYTHON** | Same shape: API-key auth, delegates entirely to `updateGameScores()` — `app/api/admin/update-game-scores/route.ts:8-21`, `:36-50` |
| 3 | `admin/users/[userId]/generate-reset-link` | **STAYS-IN-NEXTJS** | JWT session auth + in-league admin authorization + token/audit-log writes — `app/api/admin/users/[userId]/generate-reset-link/route.ts:29` (verifyAuthToken), `:51-67` (admin authz), `:88-117` (token issuance) |
| 4 | `auth/login` | **STAYS-IN-NEXTJS** | Issues JWT, sets HTTP-only cookie — `app/api/auth/login/route.ts:21-35` |
| 5 | `auth/logout` | **STAYS-IN-NEXTJS** | Clears auth cookie — `app/api/auth/logout/route.ts:10-13` |
| 6 | `auth/register` | **STAYS-IN-NEXTJS** | Issues JWT, sets cookie — `app/api/auth/register/route.ts:29-43` |
| 7 | `auth/verify` | **STAYS-IN-NEXTJS** | Reads cookie, verifies JWT — `app/api/auth/verify/route.ts:9-19` |
| 8 | `games` (GET) | **SPLIT/UNCLEAR** | No in-route auth code at all — relies solely on `middleware.ts`'s coarse cookie-presence check for the `/api/games` prefix; the handler itself is a thin `db.ts` read wrapper — `app/api/games/route.ts:5-26`, `middleware.ts:5,18-50` |
| 9 | `invitations/[invitationId]` (DELETE) | **STAYS-IN-NEXTJS** | JWT verify inline; comment admits authorization is incomplete ("any authenticated user for now") — `app/api/invitations/[invitationId]/route.ts:15-29` |
| 10 | `invite/[token]/accept` (POST) | **STAYS-IN-NEXTJS** | JWT verify from cookie, then domain call — `app/api/invite/[token]/accept/route.ts:15-25` |
| 11 | `invite/[token]` (GET) | **STAYS-IN-NEXTJS** | Intentionally public (no auth by design), but tiny — not worth splitting out on its own — `app/api/invite/[token]/route.ts:5-13` |
| 12 | `leagues/[leagueId]/invitations` (GET/POST) | **STAYS-IN-NEXTJS** | JWT verify + raw Mongo admin-membership check duplicated in both handlers — `app/api/leagues/[leagueId]/invitations/route.ts:17-27`, `:60-70` |
| 13 | `leagues/[leagueId]/members/[memberId]` (GET/PATCH/DELETE) | **STAYS-IN-NEXTJS** | Heaviest auth file in the surface: JWT verify, `authorizeRequest`, `validateAdminPermission`, audit logging — `app/api/leagues/[leagueId]/members/[memberId]/route.ts:26-33` (GET), `:73-88` (PATCH authz), `:144-166` (DELETE authz), `:189-213` (audit log) |
| 14 | `leagues/[leagueId]/members` (GET) | **STAYS-IN-NEXTJS** | `verifyLeagueMembership` gate — `app/api/leagues/[leagueId]/members/route.ts:17` |
| 15 | `leagues/[leagueId]/results` (GET) | **SPLIT/UNCLEAR** | Auth is a thin `verifyLeagueMembership` gate, but the payload (`getLeagueResults`) is the *output* of the scoring domain logic that item 3 below is moving — read side stays, write side (scoring) moves — `app/api/leagues/[leagueId]/results/route.ts:16,26` |
| 16 | `leagues/[leagueId]` (GET/PATCH/DELETE) | **STAYS-IN-NEXTJS** | `verifyLeagueMembership` (GET) + inline JWT/admin check (PATCH) — `app/api/leagues/[leagueId]/route.ts:19` (GET), `:62-78` (PATCH); DELETE is unimplemented (`:122-127`, returns 501) |
| 17 | `leagues/[leagueId]/scoreboard` (GET) | **SPLIT/UNCLEAR** | Same pattern as #15 — `verifyLeagueMembership` gate reading data produced by the scoring domain logic — `app/api/leagues/[leagueId]/scoreboard/route.ts:16,26` |
| 18 | `leagues/[leagueId]/season-summary` (GET) | **SPLIT/UNCLEAR** | Same pattern — `app/api/leagues/[leagueId]/season-summary/route.ts:16,26` |
| 19 | `leagues` (GET/POST) | **STAYS-IN-NEXTJS** | Inline cookie/JWT check in both handlers — `app/api/leagues/route.ts:10-20`, `:42-52` |
| 20 | `picks/remaining` (GET) | **SPLIT/UNCLEAR** | No in-route auth; relies on `middleware.ts` `/api/picks` gate only (cookie presence, not identity) and trusts the `user_id` query param with no ownership check — `app/api/picks/remaining/route.ts:6-17`, `middleware.ts:7` |
| 21 | `picks` (GET/POST) | **SPLIT/UNCLEAR** | Same middleware-only auth gap (trusts client-supplied `userId` in body/query, no server-side identity check) *combined with* real domain/business logic (pick-locking rules) inline in POST — `app/api/picks/route.ts:10-18` (no auth), `:63-122` (`getLeagueById`, `hasGameweekStarted`, `canPickFromGame`, `canChangeExistingPick` from `lib/game-utils.ts`) |
| 22 | `reset-password/[token]` (GET/POST) | **STAYS-IN-NEXTJS** | Token validation + bcrypt password update + audit log — credential-management surface — `app/api/reset-password/[token]/route.ts:34-64` (GET), `:168-179` (POST hash+update) |
| 23 | `users/[userId]/leagues` (GET) | **SPLIT/UNCLEAR** | No in-route auth at all, relies on `middleware.ts` `/api/users` gate (presence-only) with zero ownership check — any cookie holder can query any `userId`'s leagues — `app/api/users/[userId]/leagues/route.ts:6-14` |
| 24 | `users/[userId]` (GET/PATCH) | **SPLIT/UNCLEAR** | GET has **no auth** (public read of any user by id); PATCH has full `verifyAuthToken` + self-ownership check — the two methods in one file sit in different buckets — `app/api/users/[userId]/route.ts:7-27` (GET, no auth) vs `:41,50` (PATCH, auth + self-check) |

**Auth-mechanism finding**: `middleware.ts` gates `/api/leagues`, `/api/users`, `/api/picks`, `/api/games` by cookie *presence* only (`middleware.ts:31-44`, comment at `:41-42` explicitly says full JWT verification is deferred to route handlers "because JWT libraries don't work well in Edge Runtime"). Several routes under those prefixes (`games`, `picks`, `picks/remaining`, `users/[userId]/leagues`, `users/[userId]` GET) never actually perform that deferred verification — they either do nothing further or trust a client-supplied id. This is an existing gap, not introduced by this spike, but it matters for migration: any Python port of these routes must not assume the current Next.js auth story is airtight to replicate.

---

### 2. Data layer — `lib/db.ts` (1,887 lines, 36 exported functions)

Grouped by concern (line ranges from `grep -n "^export async function" lib/db.ts`):

| Group | Functions | Approx. lines | Bucket | Reason |
|---|---|---|---|---|
| **Users/auth** | `createUser`, `getUserByEmail`, `getUserById`, `verifyPassword`, `updateUser` — `lib/db.ts:15,31,44,57,73` | ~82 | STAYS-IN-NEXTJS | Exclusively consumed by cookie/JWT auth routes (#4-7, #19) |
| **Leagues** | `createLeague`, `getLeagueById`, `updateLeagueSettings`, `getAllLeagues`, `getAvailableLeagues` — `lib/db.ts:97,141,166,216,239` | ~200 | STAYS-IN-NEXTJS | Consumed only by session-gated routes (#16, #19) |
| **Memberships** | `createLeagueMembership`, `getUserLeagueMemberships`, `getLeagueMembers`, `getLeagueMembersWithUserData`, `getLeagueMember`, `updateMemberStatus`, `removeMemberFromLeague` — `lib/db.ts:294,340,389,438,499,558,601` | ~350 | STAYS-IN-NEXTJS | Tightly coupled to `lib/auth-utils.ts` authorization (`getAuthorizationContext`, `validateAdminPermission`) used by routes #3, #13, #14 |
| **Games** | `createGame`, `getGamesByWeek`, `getGameTimeInfoById`, `getAllTeams`, `getGamesByWeekWithPicks`, `createGameIndexes` — `lib/db.ts:646,707,950,1059,1072,1176` | ~270 | SPLIT/UNCLEAR | Reads have no auth coupling and pair naturally with the game-updater domain logic that already owns the `games` collection; `createGame`/`createGameIndexes` are never called from any of the 24 live routes — grep confirms zero importers under `app/api/` (only used by `scripts/init-db.ts`) |
| **Picks** | `createPick`, `getUserPicksByLeague`, `getUserPickForWeek` — `lib/db.ts:762,872,968` | ~280 | STAYS-IN-NEXTJS | Live, latency-sensitive interactive write-path invoked from route #21, which itself has the auth gap noted above — moving this cross-service would add a network hop to every pick submission for no domain-logic benefit |
| **Invitations** | `createLeagueInvitation`, `getLeagueInvitations`, `getInvitationByToken`, `acceptInvitation`, `revokeInvitation`, `createInvitationIndexes` — `lib/db.ts:1346,1381,1433,1489,1541,1557` | ~250 | STAYS-IN-NEXTJS | Entirely session/admin-flow driven (routes #9, #10, #11, #12) |
| **Scoring/results** | `getScoreboardWithPicks`, `getLeagueResults`, `getSeasonSummary` — `lib/db.ts:1195,1595,1709` | ~400 | SPLIT/UNCLEAR | Largest single functions in the file (`getSeasonSummary` alone is ~178 lines). These are **read/aggregation** of data that `lib/scoring.ts` **writes** — a clean split is: computation moves to Python, these read-aggregations stay in Next.js reading the same MongoDB collections |
| **Misc/seed** | `initializeDefaultData` — `lib/db.ts:1303` | ~40 | STAYS-IN-NEXTJS | Dev/test seed helper, used only by `scripts/init-db.ts`, not on the live request path |

**Total surface**: `lib/db.ts` (1,887 lines) is comparable in size to *all 24 API routes combined* (≈1,882 lines summed from `wc -l`), and roughly 1.8× the size of the domain-logic trio (`lib/scoring.ts` + `lib/game-utils.ts` + `lib/game-updater.ts` ≈ 1,021 lines). It is, as the ticket brief expected, the largest single piece of the migration surface — but the honest read is that **most of it stays**: only the Games and Scoring/results groups have a defensible reason to move, and even those are split rather than wholesale relocations.

---

### 3. Domain logic — `lib/scoring.ts`, `lib/game-utils.ts`, `lib/game-updater.ts`

| File | Lines | Bucket | Reason |
|---|---|---|---|
| `lib/scoring.ts` | 227 | **MOVE-TO-PYTHON** | Talks to MongoDB directly via `getDatabase()`/`Collections` (`lib/scoring.ts:1-2`), not through `lib/db.ts` — no dependency on the Next.js request/response layer at all. Pure batch computation (`updatePickResults`, `calculateScoresAndStrikes`, `runScoringCalculation`) — `lib/scoring.ts:35,88,194` |
| `lib/game-updater.ts` | 576 | **MOVE-TO-PYTHON** | Same pattern: raw Mongo access (`lib/game-updater.ts:1`), calls external Football-Data API directly (`:102-133`, `:136-170`), calls `runScoringCalculation()` in-process (`:313`, `:533`) rather than over HTTP. Largest and most complex of the three (hybrid bulk+individual API matching logic, `:58-242`) — a genuine standalone service candidate |
| `lib/game-utils.ts` | 218 | **SPLIT/UNCLEAR — do not force into the "domain logic" bucket** | Contrary to the ticket brief's assumption that this file groups cleanly with scoring/game-updater, it is **not** batch/cron logic — it is imported directly by two client-rendered pages (`app/make-picks/page.tsx`, `app/scoreboard/page.tsx`) for UI decisions (button disabled-states, status badges, `computeGameStatus`/`getGameCardClasses`/`getTeamSelectionClasses`) *and* by the picks API route for server-side validation (`app/api/picks/route.ts:5,76-121`). Grep confirms these are the only three importers. Porting it to Python would either (a) leave a duplicate implementation in TS for the frontend — a drift risk on the exact `computeGameStatus` time-window logic (`lib/game-utils.ts:20-57`) that both the UI and pick-locking rules depend on — or (b) require an HTTP round-trip for what is currently synchronous per-render UI logic. Recommend leaving this file in Next.js/TS and treating it as shared, not migrated. |

---

### 4. Scripts / jobs — `scripts/*` and the scheduled jobs

| Script | Bucket | Reason |
|---|---|---|
| `scripts/calculate-scores.js` (115 lines) | **MOVE-TO-PYTHON (pilot)** | Zero DB access — pure HTTP client that POSTs to `/api/admin/recompute-scores` with `X-API-Key` (`scripts/calculate-scores.js:8-10,29-35`). This *is* the CR-004 seam: it already treats scoring as a remote service. |
| `scripts/update-game-scores.js` (128 lines) | **MOVE-TO-PYTHON (pilot)** | Same pattern, hits `/api/admin/update-game-scores`. |
| `scripts/update-games.ts` (17 lines) | **MOVE-TO-PYTHON (superseded)** | Direct in-process import of `lib/game-updater.ts` (`scripts/update-games.ts:3`) — an alternate entry point to the same logic that would be replaced once `game-updater.ts` is ported. |
| `scripts/backfill-external-ids.ts`, `clone-prod-to-dev.ts`, `create-epl-league.ts`, `import-epl-2025-fixtures.ts`, `init-db.ts`, `test-external-api.ts` | **STAYS-IN-NEXTJS (Node/TS tooling)** | One-off admin/dev-ops scripts (season setup, DB cloning, fixture import, seeding) importing `lib/db.ts`/`lib/mongodb.ts` directly. Not part of the live request or cron path; low value and non-trivial risk to port (each is single-use, hand-run tooling) — out of the migration's critical path. |

**Scheduling mechanism**: There is no in-process Node scheduler — `Procfile:1` is just `web: npm start` (single web dyno, no worker/clock process). The two cron cadences (`*/15 * * * *` for scoring, `0 */3 * * *` for game updates) are documented in `scripts/README.md:84,519` as external triggers (system cron, Heroku Scheduler, or GitHub Actions) that shell out to the two HTTP-client scripts above. This confirms the scope note: **these jobs already ping HTTP endpoints today**, so piloting Python here means standing up a second small service and repointing the existing cron entries at its URL(s) — no change to *how* the jobs are invoked, only *where* they run. This is the lowest-risk, highest-isolation slice to migrate first.

---

### 5. Next.js server-feature dependency check (feeds CR-101-A)

- 17 of 18 `page.tsx` files are `"use client"` components (confirmed via `grep -rl "use client" app --include=page.tsx`); the sole exception, `app/page.tsx` (the landing page), does no data fetching at all — just static markup (`app/page.tsx:1-60`).
- No use of `cookies()`/`headers()` from `next/headers`, `export const dynamic`, or `revalidate` was found anywhere under `app/` (verified via repo-wide grep — zero matches).
- All real data fetching happens client-side against `/api/*` via `fetch()`, driven by `AuthProvider`/`LeagueProvider` context (per CLAUDE.md's documented architecture).
- `middleware.ts:56-65` only matches non-static paths but its logic (`middleware.ts:22`) is a no-op for anything not starting with `/api/` — it does not gate page routes; page-level route protection is handled client-side by `LeagueGuard`.

**One-line answer**: The frontend has **no hard SSR dependency** — it could ship as a static export/SPA (all data fetching is client-side `fetch()` against the API), *but* `output: 'export'` is incompatible with keeping `app/api/*` (24 routes) and `middleware.ts` in the same Next.js project, so a static frontend is only achievable once (or if) the API surface currently living in Next.js is split out to a separate deployable — which is exactly the question this migration is evaluating.

---

### Grouped effort estimate (S/M/L)

| Concern group | Size | T-shirt | Notes |
|---|---|---|---|
| **`lib/db.ts` — Users/auth** | ~82 lines, 5 fns | S | Stays; simple CRUD, no port needed |
| **`lib/db.ts` — Leagues** | ~200 lines, 5 fns | S | Stays |
| **`lib/db.ts` — Memberships** | ~350 lines, 7 fns | M | Stays; entangled with `auth-utils.ts` authorization |
| **`lib/db.ts` — Games** | ~270 lines, 6 fns | M | Split; read fns could migrate alongside domain logic, but 2 of 6 fns are dead code from the live-route perspective |
| **`lib/db.ts` — Picks** | ~280 lines, 3 fns | M | Stays; interactive write-path |
| **`lib/db.ts` — Invitations** | ~250 lines, 6 fns | M | Stays |
| **`lib/db.ts` — Scoring/results** | ~400 lines, 3 fns | **L** | Split; largest functions in the file, mixed read/write ownership with `scoring.ts` |
| **`lib/db.ts` — Misc/seed** | ~40 lines, 1 fn | S | Stays (dev tooling) |
| **`lib/db.ts` overall** | **1,887 lines, 36 fns** | **L (largest single piece)** | As flagged in the ticket brief — bigger than the domain-logic trio and roughly the size of all 24 routes combined, but most of the bulk (auth/leagues/memberships/invitations/picks, ~1,160 of 1,887 lines) has no reason to move |
| **`lib/scoring.ts`** | 227 lines | S | Already Mongo-native, no Next.js coupling — cleanest port |
| **`lib/game-updater.ts`** | 576 lines | **M-L** | Largest domain-logic file; external API integration + hybrid matching logic adds real porting effort, but still self-contained |
| **`lib/game-utils.ts`** | 218 lines | N/A (do not port) | Shared client+server logic; recommend leaving in TS per Section 3 |
| **24 API routes** | ~1,882 lines total | — | 2 routes MOVE (S each, thin trigger wrappers), 3 SPLIT (read-side stays, tied to `getScoreboardWithPicks`/`getLeagueResults`/`getSeasonSummary`), rest STAY |
| **Scripts/jobs** | `calculate-scores.js` + `update-game-scores.js` + `update-games.ts` ≈ 260 lines | S | Trivial HTTP-client rewrites once the Python endpoints exist; this is the pilot |

---

### Recommended phased path

**Phase 1 (pilot — matches DEC-3's "scheduled jobs / scoring" candidate):**
Port only:
- `lib/scoring.ts` (227 lines) and `lib/game-updater.ts` (576 lines) → a small Python/FastAPI service with two endpoints mirroring `POST /api/admin/recompute-scores` and `POST /api/admin/update-game-scores`.
- Repoint the two existing cron triggers (`*/15 * * * *`, `0 */3 * * *` — `scripts/README.md:84,519`) at the new service's URLs (same `X-API-Key` auth pattern, `app/api/admin/recompute-scores/route.ts:9-22`, can be replicated as-is).
- Retire `app/api/admin/recompute-scores/route.ts`, `app/api/admin/update-game-scores/route.ts`, and `scripts/update-games.ts` once the Python service is live; `scripts/calculate-scores.js`/`update-game-scores.js` either get repointed or retired in favor of the scheduler calling Python directly.

**What stays untouched in Next.js in phase 1** (everything else):
- All 4 auth routes, all admin/membership/invitation routes, `leagues`, `picks`, `picks/remaining`, `users/*`, `reset-password/*` (22 of 24 routes).
- All of `lib/db.ts` except that the Games and Scoring/results *read* functions (`getGamesByWeek`, `getGamesByWeekWithPicks`, `getScoreboardWithPicks`, `getLeagueResults`, `getSeasonSummary`) now read data that Python writes instead of data that a Next.js cron-triggered route writes — no code change required for this, since both sides already talk to the same MongoDB collections directly (`lib/scoring.ts:2`, `lib/db.ts` throughout use the same `Collections` enum from `lib/mongodb.ts`).
- `lib/game-utils.ts` stays in TS (Section 3) — do not attempt to port it alongside scoring/game-updater despite the scope brief grouping them together.
- `middleware.ts` and all cookie/JWT session handling stay in Next.js.

**Phase 2+ (not scoped here, flagged for team discussion, AC7):** the SPLIT/UNCLEAR routes (#8, #15, #17, #18, #20, #21, #23, #24) and the Games/Picks `db.ts` groups are the next-most-defensible candidates *if* the pilot succeeds, since several already have weak or absent auth coupling — but moving them fragments the interactive request path across two services and should be a deliberate follow-on decision, not a phase-1 default.

---

*Out of scope per ticket: hosting cost (CR-101-A), contract tooling (CR-101-C), repo layout (CR-101-D), the go/no-go decision (team, AC7).*
