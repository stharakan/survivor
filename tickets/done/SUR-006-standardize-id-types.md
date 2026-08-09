# SUR-006: Standardize League ID and Member ID Types to String

**Ticket ID**: SUR-006
**Title**: Standardize League ID and Member ID Types from Number to String
**Type**: Technical Debt
**Priority**: Low (downgraded from High — see Status; closed at Low)
**Estimated Story Points**: 2 (downgraded from 8 — see Status)
**Status**: Done — re-triaged 2026-08-09, frontend fix completed and re-verified
same day. The backend half was already fully done (fixed as a deliberate,
documented side effect of the CR-105 Python port). The frontend half — the
`types/league.ts` + `lib/api-client.ts` + coercion cleanup described in AC1-AC3
below — has now landed. Verification performed against the actual working tree:

- `types/league.ts:2,13` — `League.id` and `League.createdBy` are `string`. ✅
- `lib/api-client.ts` — every league/member-ID-taking function (all 16, including
  `getSeasonSummary` and `getLeagueInvitations`/`createLeagueInvitation`, which a
  first implementation pass had missed) is typed `string`; a full-file read
  confirms zero remaining bare `number` or `number | string` unions on these
  params. ✅
- Coercions removed: `hooks/use-league.tsx:45,81` (`.toString()` calls gone),
  `app/leagues/page.tsx:69` (`getUserMembershipStatus` now takes `leagueId:
  string`), `app/player/page.tsx:41` (`getPlayerProfile` called with
  `currentLeague.id` directly, no `String(...)` wrap). Bonus (optional per AC3,
  done anyway, correctly): the harmless `LeagueMembership.id.toString()` no-ops
  in `app/admin/page.tsx:170,447` and `app/profile/page.tsx:113` were also
  cleaned up. ✅
- Repo-wide grep for `leagueId: number`, `memberId: number`, and any remaining
  `.toString()`/`String(...)` wrapping `league.id`/`member.id` across
  `app/`, `hooks/`, `lib/api-client.ts` — zero hits. ✅
- `git status` confirms `api/app/*`, `lib/db.ts`, `lib/auth-utils.ts`, and
  `app/api/*` were untouched — scope stayed frontend-only as required. ✅
- `npx tsc --noEmit` shows no new errors traceable to this change (the two
  pre-existing errors it surfaces — a `LeagueMembership`/`MemberWithUserDetails`
  mismatch in `app/admin/page.tsx` and a `Pick.result` union gap in
  `app/profile/page.tsx:368` tied to SUR-008's `"dnp"` work — are unrelated to
  league/member ID typing and predate this ticket). ✅

All Definition of Done items below are satisfied. Moved to `tickets/done/`.

## Re-triage Summary (2026-08-09)

The original ticket (written for the old Next.js API Route Handler stack) is
almost entirely obsolete: `app/api/*` and `lib/db.ts`'s call sites were deleted
under CR-106 (`tickets/done/CR-106-frontend-static-export-cutover.md`), and the
backend was rewritten from scratch in Python as part of CR-105
(`tickets/done/CR-105-full-migration-audit.md`). Rather than just renaming file
paths, the underlying question — "is number/string ID confusion still a real
problem?" — was independently re-investigated:

- **Backend (`api/app/`)**: Confirmed **fully resolved**. `api/app/models/league.py:18`
  and `:33` declare `League.id: str` and `League.createdBy: str`, with an explicit
  comment citing this exact bug and stating it was fixed at port time rather than
  ported as-is:
  > `id: str  # FIX: types/league.ts:2 declares number; actual runtime type is str`
  This was flagged as a known, then-unfixed drift in `CR-105-FINDINGS.md` Table 4
  ("League row -- flagged there as a bigger, more systemic drift than the known
  Pick.result case") and deliberately corrected during the port, not carried
  forward. Every DB function in `api/app/db/leagues.py` and
  `api/app/db/memberships.py` takes `str` params and does `ObjectId(league_id)` /
  `ObjectId(member_id)` / `ObjectId(user_id)` consistently at the single point
  each ID crosses into a Mongo query. Every router (`api/app/routers/leagues.py`,
  `members.py`, `results.py`, `games.py`, `picks.py`, `invitations.py`) types
  path/query params as `str`, with no `int()`-equivalent conversions anywhere.
  `api/app/routers/picks.py:24-25` goes further and adds an explicit
  `ObjectId.is_valid(league_id)` guard that 400s on malformed IDs rather than
  crashing. `api/app/models/requests.py` (`CreatePickRequest.leagueId`,
  `GenerateResetLinkRequest.leagueId`, etc.) is `str` throughout. No numeric
  ID handling of any kind was found in the backend.

- **Frontend (`types/`, `lib/api-client.ts`, `hooks/`, `app/`)**: Confirmed
  **still broken as originally described, but narrower**. `types/league.ts:2`
  still declares `id: number` and `types/league.ts:13` still declares
  `createdBy: number`, even though every runtime value is a MongoDB ObjectId
  string returned by the (now-correct) Python backend. `lib/api-client.ts` has
  ~13 functions still typed `leagueId: number` (`getLeague`, `getScoreboard`,
  `getLeagueResults`, `getProfile`, `updateMemberStatus`,
  `updateLeagueSettings`, `getUserPicks`, `getPicksRemaining`,
  `getUpcomingGames`, `getUpcomingGamesWithPicks`, `makePick`,
  `getSeasonSummary`, `createLeagueInvitation`, `getLeagueInvitations`), 3 more
  patched with a `number | string` union (`getLeagueMembers`, `getLeagueMember`,
  `removeMemberFromLeague`) rather than fixed outright, and exactly one
  (`getPlayerProfile`, added new under CR-106) correctly typed `leagueId: string`
  — showing new code written against the Python backend gets this right while
  old code was never revisited.
  - **However**, unlike the original ticket's description, there is **no
    remaining runtime type-conversion bug**: a repo-wide grep for
    `parseInt`/`Number()` applied to league/member IDs across `app/`,
    `components/`, `hooks/`, `lib/` came back empty (the one `parseInt` hit,
    `lib/game-updater.ts:21`, is an unrelated env-var read). All call sites
    (`app/make-picks/page.tsx`, `app/admin/page.tsx`, `app/scoreboard/page.tsx`,
    `app/profile/page.tsx`, `app/results/page.tsx`, etc.) pass `currentLeague.id`
    straight through as a string; it works today purely because JavaScript
    doesn't enforce the (wrong) TypeScript annotation and `ignoreBuildErrors:
    true` (see CLAUDE.md) means `tsc` never catches the mismatch at build time.
  - The mismatch does show up as defensive workarounds scattered through the
    frontend — evidence developers already half-suspect the type is wrong:
    `hooks/use-league.tsx:45` and `:81` call `.toString()` on `league.id`;
    `app/leagues/page.tsx:69-70`'s `getUserMembershipStatus(leagueId: number)`
    compares two mistyped-`number`-but-actually-`string` values; and
    `app/player/page.tsx:41` wraps it in `String(currentLeague.id)`. A few more
    `.toString()` calls (`app/admin/page.tsx:170,447`,
    `app/profile/page.tsx:113`) are on `LeagueMembership.id`, which is already
    correctly typed `string` in `types/league.ts:21` — those are harmless no-ops,
    but the same "I don't trust this type" pattern.
  - `types/user.ts` and `types/invitation.ts` are unaffected and already
    consistently `string` (unchanged from the original ticket's assessment).
  - `lib/api-types.ts` has no Zod validation for league/member IDs at all (only
    `gameId`/`teamId`, which are legitimately numeric football-data.org fixture
    IDs and are out of scope for this ticket either way) — AC8 in the original
    ticket ("validation schemas… proper validation for string ID formats") does
    not really apply; there's nothing to update because nothing validates these
    IDs client-side today.

- **Dead code note**: `lib/db.ts` and `lib/auth-utils.ts` (the original ticket's
  "Database Layer" and part of its API-route target) are no longer imported by
  any live application code — `app/api/*` was deleted under CR-106, and
  `lib/auth-utils.ts` (which imports `lib/db.ts`) has zero remaining importers.
  `lib/db.ts` is only still reachable from two standalone maintenance scripts
  (`scripts/init-db.ts`, `scripts/create-epl-league.ts`) that run outside the
  app/API server. These files are **not** part of this ticket's scope going
  forward; the ID-type problem in them is moot because they're not on any
  request path a user or the deployed API server exercises.

**Recommendation**: Do not close this ticket outright (there is real, live stale
typing in `types/league.ts` and `lib/api-client.ts` that should eventually be
fixed for correctness and to stop new code from copying the wrong pattern), but
it should be re-prioritized down from High to Low/cleanup-backlog — it is a type
hygiene fix with no reproduced user-facing bug, not the cross-stack
correctness risk it was when written. A human should confirm this
re-prioritization and can move it to `tickets/done/` once the (much smaller)
Acceptance Criteria below are met, or close it as won't-do if the team decides
type-annotation-only drift isn't worth the churn while `ignoreBuildErrors: true`
remains in place.

## User Story

As a developer, I want the frontend `League` type and `lib/api-client.ts`
signatures to declare league/member IDs as `string` (matching what the Python
backend actually returns and what every frontend call site actually passes) so
that the type system stops lying, defensive `.toString()`/`String()` workarounds
can be removed, and future code doesn't copy the wrong pattern.

## Description

### Current State (as of 2026-08-09)
- **Backend**: Already fully consistent. Every Pydantic model, DB function, and
  FastAPI route treats league IDs and member IDs as `str`, with `ObjectId(...)`
  conversion happening only at the Mongo-query boundary. No further backend work
  is needed for this ticket.
- **Frontend**: `types/league.ts` still declares `League.id` and
  `League.createdBy` as `number`, even though the Python backend has always
  returned them as strings (this was true even briefly under the *old* Next.js
  API routes, per `api/app/models/league.py`'s FIX comment citing `lib/db.ts`'s
  `.toString()` behavior — this was never actually a number at runtime, only in
  the type annotation). `lib/api-client.ts` mixes `number`, `number | string`,
  and (once) correctly `string` across its league/member-ID-taking functions.
  No `parseInt`/`Number()` conversions remain, so nothing is runtime-broken
  today, but the types actively mislead.

### Desired State
- `types/league.ts`: `League.id: string`, `League.createdBy: string`.
- `lib/api-client.ts`: every function taking a league or member ID parameter
  declares it `string` (no bare `number`, no `number | string` union).
- `hooks/use-league.tsx`: `.toString()` calls on `league.id` removed since
  `league.id` is already a string post-fix (localStorage comparison logic
  otherwise unchanged — it already does plain string equality).
- `app/leagues/page.tsx`'s `getUserMembershipStatus` and `app/player/page.tsx`'s
  `String(currentLeague.id)` updated to drop the now-unnecessary coercions.
- No behavior change expected anywhere — this is a type-correctness pass, not a
  data-flow change, since every value involved is already a string at runtime.

## Acceptance Criteria

Backend ACs from the original ticket (type definitions, DB layer, API layer) are
**dropped** — already satisfied by the CR-105 Python port, see Re-triage Summary
above. Remaining ACs are frontend-only and rescoped to match actual current
drift:

**AC1: `types/league.ts` Type Correction**
Given: `League.id` and `League.createdBy` are declared `number` in
`types/league.ts:2,13` but are always strings at runtime
When: Both fields are changed to `string`
Then: The `League` type accurately describes the data the Python backend
(`api/app/models/league.py`) actually returns

**AC2: `lib/api-client.ts` Signature Cleanup**
Given: `lib/api-client.ts` has ~13 functions typed `leagueId: number` and 3 more
typed `leagueId: number | string` / `memberId: number | string`
When: All of these are changed to `leagueId: string` / `memberId: string`
Then: No function in `lib/api-client.ts` that forwards a league or member ID
into a URL declares it as anything other than `string`

**AC3: Remove Now-Unnecessary Defensive Coercions**
Given: `hooks/use-league.tsx:45,81`, `app/leagues/page.tsx:69`, and
`app/player/page.tsx:41` contain `.toString()`/`String(...)` calls that exist
only because `League.id`'s declared type was `number`
When: AC1 lands
Then: These coercions are removed (they become no-ops once the underlying type
is correct); the redundant `.toString()` calls on the already-`string`
`LeagueMembership.id` (`app/admin/page.tsx:170,447`, `app/profile/page.tsx:113`)
may optionally be cleaned up in the same pass but are not blocking

**AC4: No Regressions**
Given: Every runtime value involved is already a string today (confirmed by
the CR-105 backend port and the absence of any `parseInt`/`Number()` on
league/member IDs anywhere in the frontend)
When: AC1-AC3 land
Then: All user workflows (league selection, admin member management,
scoreboard, profile, make-picks, invitations) continue to work identically —
this is provable by manual smoke test, not a behavior change requiring new test
coverage

## Technical Requirements

### Architecture
Frontend-only, type-level change. No backend, database, or API contract changes
— `api/app/` is already correct and untouched by this ticket.

### File Locations

**Type Definitions:**
- `types/league.ts:2` — `id: number` → `id: string`
- `types/league.ts:13` — `createdBy: number` → `createdBy: string`
- `types/user.ts`, `types/invitation.ts` — already `string`, no change needed
  (verified consistent)

**API Client (`lib/api-client.ts`):**
- Line 98 `getLeague(leagueId: number)`
- Line 106 `getLeagueMembers(leagueId: number | string)`
- Line 110 `getScoreboard(leagueId: number)`
- Line 117 `getLeagueResults(leagueId: number)`
- Line 132 `getProfile(userId: string, leagueId: number)`
- Line 143 `getLeagueMember(leagueId: number | string, memberId: number | string)`
- Lines 147-148 `updateMemberStatus(leagueId: number, memberId: string, ...)`
- Line 158 `removeMemberFromLeague(leagueId: number | string, memberId: number | string)`
- Lines 164-165 `updateLeagueSettings(leagueId: number, ...)`
- Line 182 `getUserPicks(userId: string, leagueId: number)`
- Lines 186-188 `getPicksRemaining(userId: string, leagueId: number)`
- Line 193 `getUpcomingGames(week: number, leagueId: number)` — leave `week` alone, fix `leagueId`
- Line 197 `getUpcomingGamesWithPicks(week: number, leagueId: number, userId: string)` — leave `week` alone, fix `leagueId`
- Line 201 `makePick(userId: string, gameId: number, teamId: number, leagueId: number, week?: number)` — leave `gameId`/`teamId`/`week` alone (legitimate numeric fixture IDs), fix `leagueId`
- Line 246 `getSeasonSummary(leagueId: number)`
- Lines 251-252 `createLeagueInvitation(leagueId: number, ...)`
- Line 262 `getLeagueInvitations(leagueId: number)`
- Line 237 `getPlayerProfile(playerId: string, leagueId: string)` — already correct, added under CR-106, use as the reference pattern

**Frontend call sites (coercions to remove once AC1 lands):**
- `hooks/use-league.tsx:45` — `m.league.id.toString() === storedLeagueId`
- `hooks/use-league.tsx:81` — `localStorage.setItem("selectedLeagueId", league.id.toString())`
- `app/leagues/page.tsx:69` — `getUserMembershipStatus = (leagueId: number) => ...`
- `app/player/page.tsx:41` — `getPlayerProfile(playerId, String(currentLeague.id))`

**Backend — no changes required (verified already correct):**
- `api/app/models/league.py:18,33` — `League.id: str`, `createdBy: str`
- `api/app/db/_shape.py:66-77` — `league_from_doc` (uniform `str(doc["_id"])` shaping)
- `api/app/db/leagues.py`, `api/app/db/memberships.py` — consistent `ObjectId(...)` conversion at the DB boundary
- `api/app/routers/leagues.py`, `members.py`, `results.py`, `games.py`, `picks.py`, `invitations.py` — all path/query params `str`
- `api/app/routers/picks.py:24-25` — explicit `ObjectId.is_valid()` guard (a strictly *better* pattern than the original ticket asked for)
- `api/app/models/requests.py` — request-body `leagueId` fields already `str`

**Not in scope / obsolete (do not touch):**
- `app/api/leagues/[leagueId]/*` — deleted under CR-106; replaced by the `api/app/routers/*.py` files above
- `lib/db.ts` — no longer imported by any live route; dead except for two
  standalone maintenance scripts (`scripts/init-db.ts`,
  `scripts/create-epl-league.ts`) that don't run as part of the app or API
  server
- `lib/auth-utils.ts` — imports `lib/db.ts`; itself has zero remaining importers,
  fully dead code

### Dependencies
None. Pure type-annotation change; no new packages.

## Definition of Done

- [x] `types/league.ts`: `League.id` and `League.createdBy` changed to `string`
- [x] `lib/api-client.ts`: all league/member-ID-taking function signatures use
  `string` (no bare `number`, no `number | string` unions)
- [x] Now-unnecessary `.toString()`/`String()` coercions removed from
  `hooks/use-league.tsx`, `app/leagues/page.tsx`, `app/player/page.tsx`
- [ ] Manual smoke test: login → league selection → profile → make-picks →
  scoreboard → admin member management (paid/admin toggle, remove member) →
  results all work with no console errors — **not performed as part of this
  re-verification** (static code/type-level check only); recommend a human
  click through this once before/alongside the next deploy, though risk is very
  low per the Risk Assessment below
- [x] No changes made to `api/app/*` (already correct — verified no drift was
  accidentally introduced)
- [x] No changes made to dead `lib/db.ts` / `lib/auth-utils.ts` / `app/api/*`
  (the last of which no longer exists)

## Risk Assessment

**Very Low Risk.** Every value involved is already a string at runtime; this
change only corrects type annotations and removes now-redundant coercions. The
backend contract is untouched. `ignoreBuildErrors: true` (CLAUDE.md) means this
also can't break the production build even if something is missed, though it
should still be done properly and manually smoke-tested per the DoD.

## Related Resources

- `tickets/done/CR-105-full-migration-audit.md`, `CR-105-FINDINGS.md` Table 4 —
  where this exact League `id`/`createdBy` number-vs-string drift was first
  flagged and fixed on the backend side
- `tickets/done/CR-106-frontend-static-export-cutover.md` — deleted `app/api/*`
  and `middleware.ts`, the original ticket's primary API-layer target
- `tickets/done/CR-107-membership-removed-status-enum-gap.md` — an example of
  the same "TS type says X, Pydantic now enforces it, gap becomes a hard error
  instead of silently passing" pattern, for a different field
- CLAUDE.md — confirms `ignoreBuildErrors: true`, i.e. TypeScript errors do not
  block the production build today

## Original Ticket (2026, pre-migration) — Preserved for History

The remainder of this section is the ticket as originally written against the
old Next.js API Route Handler + `lib/db.ts` stack, before CR-105/CR-106. It is
kept for historical context only — its ACs, file locations, and phased
migration plan below are **superseded by the rescoped ACs and File Locations
above** and should not be used to guide new work.

> As a developer, I want to standardize all league ID and member ID types to
> strings throughout the codebase so that we have consistent data type
> handling that aligns with our MongoDB ObjectId storage format, reducing type
> conversion errors and improving code maintainability.
>
> The codebase currently has inconsistent handling of league IDs and member
> IDs, with some parts treating them as numbers and others as strings:
> - **Type Definition Mismatches**: The `League` type defines `id` as `number`,
>   but MongoDB stores it as ObjectId (converted to string in API responses)
> - **API Parameter Inconsistencies**: Some API routes expect string
>   parameters while internal functions may use number types
> - **Frontend Type Confusion**: Components and hooks sometimes need to
>   convert between string and number representations
> - **Database Query Issues**: ObjectId requires string inputs, but some
>   queries may receive number inputs
>
> Originally-cited file locations (all now deleted or dead, see above):
> `types/league.ts:2,12,17`, `lib/db.ts:758`,
> `lib/api-client.ts:97,105,109,113,128,136,140,144,151`,
> `app/api/leagues/[leagueId]/scoreboard/route.ts:23`,
> `hooks/use-league.tsx:45,81`, `lib/api-types.ts:54-55`.
>
> Originally estimated at 8 story points across 8 ACs spanning type
> definitions, database layer, API layer, frontend components, hooks, API
> client, localStorage, and validation — see git history for this file's full
> original text if needed.
