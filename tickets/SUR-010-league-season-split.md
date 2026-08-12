# SUR-010: Split League into League (year-agnostic) + LeagueSeason (per-year instance)

**Ticket ID**: SUR-010
**Title**: Introduce `LeagueSeason` as the per-year play instance; `League` becomes the
year-agnostic parent (group + sport identity)
**Type**: Architecture / Data Model Migration
**Priority**: High (blocks EPL 2026/2027 season setup)
**Status**: Not started — requirements gathered and confirmed with Sameer on
2026-08-11, this ticket is the resulting spec.

## Problem

Today `League` is a single collection/document that conflates two different
lifetimes:

1. **The persistent group + sport identity** — "Tharakan Bros Survivor League",
   EPL, created once, exists across years.
2. **One year's actual competition** — the specific `season` string
   (`"2025/2026"`), the active roster of members, the week-tracking counters
   (`current_game_week`/`current_pick_week`/`last_completed_week`), the picks
   made against it.

`api/app/db/leagues.py:144-212`'s `start_new_season()` already tried to handle
year-over-year rollover by mutating the *same* `League` document in place
(resetting `season`, week counters, and member stats, archiving old standings
into a `seasonArchive` array). That function's own docstring records that a
League/Season entity split was **considered and explicitly rejected** at the
time, in favor of in-place rollover. We are now reversing that decision — the
in-place approach doesn't support "look up a member's history across seasons",
"have two concurrent seasons exist briefly during rollover", or the immediate
need (spin up EPL 2026/2027 as a new, addressable entity while 2025/2026 stays
queryable). `start_new_season()` has in fact never been run against real data —
`seasonArchive` is empty on both existing League docs in dev — so there is no
historical rollover data to migrate, only live current-season state.

**Immediate trigger**: set up EPL season 2026/2027 for the existing "Tharakan
Bros Survivor League". Doing that correctly requires this split to exist first
(see Stage D).

**Related cleanup — `CR-108`**: a 2026-08-12 audit (while scoping this ticket)
found `lib/scoring.ts`, `lib/game-updater.ts`, and `lib/auth-utils.ts` are
orphaned — `tickets/CR-108-retire-orphaned-scoring-ts-files.md` deletes them.
If CR-108 lands before this ticket, ignore the `lib/scoring.ts`/
`lib/game-updater.ts` mentions in Stage E and the "Files to modify" table below
(files won't exist to update). It does **not** touch `lib/db.ts`/
`lib/mongodb.ts` — those still back `scripts/init-db.ts` and
`scripts/create-epl-league.ts`, both of which construct `League`/
`LeagueMembership` documents by hand, outside `api/app/db/leagues.py`. **This
ticket should explicitly decide** whether Stage A/D updates those two scripts
to the new `League`/`LeagueSeason` shape, replaces them outright with
`scripts/create-league-season.ts`, or knowingly leaves them stale — don't let
it fall through by default, since nothing will error loudly if they drift
(same "no parity test" gap CR-108 found for the files it removes).

## Current state (evidence)

Confirmed by direct inspection of the dev DB (`survivor-league-dev`,
2026-08-11):

```
leagues (2 documents):
  "Tharakan Bros Survivor League" — EPL, season 2025/2026, 57 members,
     createdAt 2025-08-12, isActive=true, seasonArchive=[] (never rolled)
  "Demo League" — EPL, season 2024/2025, 3 members (init-db.ts seed data),
     createdAt 2025-08-08, isActive=true, seasonArchive=[]
league_memberships: 60   picks: 1070   games: 392   league_invitations: 5
distinct game seasons: ["2024/2025", "2025/2026"]
```

Key structural facts (from full codebase sweep, file:line references below):

- **`League` schema** — `api/app/models/league.py:17-37`, `types/league.ts:1-18`,
  written via `api/app/db/leagues.py:23-64` / `lib/db.ts:97-139`. No indexes
  exist on the `leagues` collection today.
- **Every league-scoped collection stores a `leagueId` FK**: `league_memberships`
  (`api/app/db/memberships.py:41`), `picks` (`api/app/db/picks.py:51,79,82,93` —
  the pick-uniqueness upsert key is `{userId, leagueId, week}`),
  `league_invitations` (`api/app/db/invitations.py:39`, only FK with an actual
  index: `invitations_league_active` on `{leagueId, isActive}`,
  `lib/db.ts:1567-1570`, never ported to Python), and ad hoc `audit_logs`
  (`api/app/routers/members.py:118`, `api/app/core/auth_deps.py:146`).
- **`LeagueMembership.league` embeds the full `League` object**, not a bare FK
  (`api/app/models/league.py:40-54`) — every read path `$lookup`s/joins the whole
  League doc inline (`api/app/db/memberships.py:16-32`).
- **`Game` has NO `leagueId` field at all.** Games are matched by
  `{sportsLeague, season, week}` string/int fields only
  (`api/app/db/games.py:20-28,58-66`), completely decoupled from any League
  `_id`. This is unaffected by the split — see Design Decisions.
- **Week-tracking fields (`current_game_week`/`current_pick_week`/
  `last_completed_week`) are computed once per League doc**, redundantly, even
  though today two League docs sharing a `{sportsLeague, season}` pair would
  compute identical values (`api/app/db/game_updater.py:466-498`,
  `_update_league_week_tracking`, loops every active League).
- **Two distinct "admin" concepts** currently collapse onto one document:
  per-membership `isAdmin: bool` (day-to-day permissions,
  `api/app/models/league.py:52`) and `League.createdBy` (the *owner* — the
  creator's membership can never be demoted/removed,
  `api/app/core/auth_deps.py:122-123`, `api/app/routers/members.py:107-108`).
  These need to end up on different objects post-split (see Design Decisions).
- **Invitations are tied to a League `_id`**
  (`api/app/models/invitation.py:20-30`), which today is implicitly
  season-specific since League == LeagueSeason.

## Design decisions (confirmed 2026-08-11)

| Question | Decision |
|---|---|
| Migration target | Dev first, thoroughly verified, then prod in the same effort (not a separate future session) |
| League identity | Multiple `League`s per sport are allowed (group + sport identity, not just sport) — matches the dev DB reality of two unrelated EPL leagues today |
| Which collections move to `leagueSeasonId` | **All** of them: `LeagueMembership`, `Pick`, `LeagueInvitation` (audit_logs too, for consistency) |
| FK field naming | **Rename** `leagueId` → `leagueSeasonId` everywhere it refers to a season instance (schema, db modules, routers, `api-client.ts`, frontend pages) — no silent semantic reinterpretation of a same-named field |
| Migration mechanics | Two-step: (1) turn existing `leagues` docs into `league_seasons` docs, same `_id`s, so every existing FK value stays valid; (2) create new parent `League` docs and backfill `LeagueSeason.leagueId` |
| Membership continuity across season rollover | **Auto-carry-over** — creating a new `LeagueSeason` clones each active membership from the previous season (see Stage D for exact field handling) |
| Invitation scope | **Stays LeagueSeason-scoped** (unchanged behavior) — an invite joins one specific season; old links go stale when a season ends, admin generates a fresh one per season |
| `start_new_season()` | **Retired and replaced** by a new "create LeagueSeason" operation that creates a new document under the same League parent, instead of mutating one document in place |
| Demo League (dev) | **Delete it** before migrating — it's seed data, not migrated |
| Ticket structure | One ticket (this one), staged sections, executed and verified stage-by-stage on one branch |

### Where fields end up

**`League`** (new collection `leagues`, one row per persistent group+sport):
`id`, `name`, `description`, `sportsLeague`, `logo`, `createdBy` (owner,
protected from removal), `createdAt`, `currentSeasonId` (FK →
`LeagueSeason._id`), `pastSeasonIds` (FK array → `LeagueSeason._id`,
chronological, excludes `currentSeasonId`).

**`LeagueSeason`** (renamed collection `league_seasons`, was `leagues`, one row
per year of play): `id`, `leagueId` (FK → `League._id`, **new field**), `season`
(unchanged string, e.g. `"2026/2027"` — must keep matching `Game.season`'s
format, no change to game-lookup logic), `isActive`, `memberCount`, `isPublic`,
`requiresApproval`, `hideScoreboard`, `current_game_week`, `current_pick_week`,
`last_completed_week`, `createdAt` (season-creation timestamp).

`name`/`description`/`sportsLeague`/`logo`/`createdBy` move **fully** to
`League` — no duplication on `LeagueSeason`. `isPublic`/`requiresApproval`/
`hideScoreboard` stay on `LeagueSeason` (join policy is inherently
season-scoped, consistent with invitations staying season-scoped).

**Frontend-facing shape stays flattened.** Per the "transparent, no UX change"
requirement, the API continues to hand the frontend one denormalized object —
`LeagueSeason` fields merged with its parent `League`'s `name`/`description`/
`sportsLeague`/`logo` — keyed by `LeagueSeason._id` as `id` (exactly what
`currentLeague.id` already is today). This means most `app/*` pages need **no
change** beyond `leagueId` param renames; only the hook/db layer actually joins
two collections now. Implement this as a shaping function (e.g.
`league_season_with_league_from_docs` in `api/app/db/_shape.py`) rather than
letting every call site do its own lookup.

`Game` needs **no schema change** — it stays matched by `{sportsLeague, season,
week}`. Callers that today read `league.sportsLeague` directly (e.g.
`api/app/db/games.py`) now resolve `LeagueSeason.leagueId → League.sportsLeague`
first, one extra join hop.

### Admin/owner re-derivation

- `League.createdBy` = owner, set once at League creation, never touched by
  season rollover.
- The "creator can't be demoted/removed" check
  (`api/app/core/auth_deps.py:122-123`) currently compares `League.createdBy` to
  a membership in the *same* document. Post-split it must resolve
  `membership.leagueSeasonId → LeagueSeason.leagueId → League.createdBy` before
  comparing — an explicit two-hop lookup, not a same-document field read
  anymore. Get this right; it's a correctness-critical permission check.
- `LeagueMembership.isAdmin` stays per-membership (i.e. per season) and is
  carried forward automatically on season rollover (see Stage D) — so in
  practice admin status persists season-to-season the same way it silently did
  under the old in-place `start_new_season()`, just via explicit copy now
  instead of implicit same-document mutation.

### Assumptions made without an explicit question — flag if wrong

These are reasonable defaults, not confirmed line-by-line with Sameer; call
them out for a quick sanity check before/during implementation:

- **`isPaid` resets to `false`** on each new season's carried-over membership
  (dues are collected per season). `isAdmin` and `teamName` carry over
  unchanged (editable after the fact, same as today).
- **`pastSeasonIds` ordering**: chronological ascending (oldest first),
  excludes the current season's id.
- Migration renames the old `leagues` Mongo collection by **copy-then-drop**
  (read every doc, insert into `league_seasons` with the same `_id`, then drop
  the source) rather than a native `renameCollection` command — Atlas
  shared-tier clusters can restrict admin commands like `renameCollection`, and
  copy-then-drop is portable and lets us keep a pristine backup collection
  around instead of relying on the driver's rename semantics. Confirm the dev
  cluster tier if this matters (Atlas M-tier free/shared clusters are the
  likely case here given the connection string).

## Stage A — Schema & migration script (dev)

New TS ops script, `scripts/migrate-league-to-leagueseason.ts` (same style as
`scripts/create-epl-league.ts` — raw `mongodb` driver via `lib/mongodb.ts`, run
with `tsx`). Must be:

- **Dry-run by default.** Print every planned write (counts, sample docs)
  without touching the DB. Requires an explicit `--execute` flag to write.
- **Environment-guarded.** Refuse to run against a DB whose
  `MONGODB_DB_NAME`/`MONGODB_URI` doesn't look like dev, unless an explicit
  `--allow-prod` flag is passed (belt-and-suspenders given Stage F reuses this
  same script against prod).
- **Idempotent / re-runnable.** Check what's already done before redoing it
  (e.g. skip Phase 1 if `league_seasons` already has a matching doc count; skip
  a `$rename` if the target field name is already present).

### Phase 0 — pre-flight

- Delete the "Demo League" doc and its dependent `league_memberships`/`picks`
  (there are none — 0 games/picks reference `season: "2024/2025"` beyond what
  Demo League itself seeded... verify this in dry-run output before deleting;
  don't assume, print the exact counts).
- Print current doc counts for `leagues`, `league_memberships`, `picks`,
  `league_invitations`, `audit_logs` (docs with a `leagueId` field) for
  operator review.
- Recommend (print, don't auto-run) a `mongodump` snapshot command before
  `--execute` runs against prod.

### Phase 1 — `leagues` → `league_seasons`, create parent `League`s

For each remaining `leagues` doc (today: just "Tharakan Bros Survivor League"
in dev, 1:1 no grouping needed — every existing `League` doc becomes exactly
one `LeagueSeason` + spawns exactly one new parent `League`; there is no
multi-season grouping to resolve in current data):

1. Capture `name`, `description`, `sportsLeague`, `logo`, `createdBy`,
   `createdAt` from the original doc.
2. Insert a new `league_seasons` doc with the **same `_id`** as the original
   (so every existing `leagueId` value in `league_memberships`/`picks`/
   `league_invitations`/`audit_logs` is still a valid pointer, just not yet
   correctly named), keeping `season`/`isActive`/`memberCount`/`isPublic`/
   `requiresApproval`/`hideScoreboard`/`current_game_week`/`current_pick_week`/
   `last_completed_week`/`createdAt`, dropping the fields captured in step 1,
   and setting `leagueId: null` (placeholder, backfilled in step 4).
3. Insert a new `leagues` doc (fresh `ObjectId`) with the captured fields plus
   `currentSeasonId: <the league_seasons doc's _id>`, `pastSeasonIds: []`.
4. Backfill `league_seasons.leagueId` with the new parent's `_id`.
5. Drop the original `leagues` collection **only after** verifying `(4)`
   succeeded for every doc and doc counts reconcile; keep a
   `leagues_pre_migration_backup` copy (rename-or-recopy, operator's choice via
   flag) rather than an unconditional drop, so rollback doesn't depend on
   external `mongodump` state.

### Phase 2 — field rename across dependent collections

`$rename: {leagueId: "leagueSeasonId"}` via `updateMany({}, ...)` on
`league_memberships`, `picks`, `league_invitations`, `audit_logs`. Values are
untouched (same ObjectId/string), only the field name changes — this is safe
because Phase 1 guaranteed every existing `leagueId` value still resolves to a
document, now living in `league_seasons` instead of `leagues`.

### Phase 3 — verification (run automatically at the end of `--execute`, and standalone via `--verify-only`)

- Every `league_seasons.leagueId` resolves to an existing `leagues._id`.
- Every `leagues.currentSeasonId` resolves to an existing `league_seasons._id`,
  and that doc's `leagueId` points back to the same `leagues._id` (round trip).
- Pre/post doc counts match exactly for `league_memberships`, `picks`,
  `league_invitations`, `audit_logs` (rename never changes count).
- Zero documents in those four collections still have a `leagueId` field
  (confirms the rename is total, not partial).
- Spot check: pick one known user, fetch their memberships by new
  `leagueSeasonId`, confirm the resulting league/season/role matches what was
  true before migration (compare against the Phase 0 printout).

### Rollback

`--rollback` mode: reverse `$rename` (`leagueSeasonId` → `leagueId`) on the four
collections, restore `leagues` from `leagues_pre_migration_backup`, drop
`league_seasons` and the new `leagues` (parent) docs created in Phase 1. Only
needs to work against the backup this same script created — not a general
disaster-recovery tool.

**Stage A is done when**: script runs clean (`--dry-run` then `--execute`)
against dev, Phase 3 verification passes, and a manual spot-check via
`mongosh`/Compass confirms the shape matches this ticket's schema section.
**Do not proceed to Stage B until this is true** — Stage B's code assumes the
new shape exists.

## Stage B — Backend model/db/router refactor

Split, don't duplicate. Files (see explore findings above for current
line numbers):

- `api/app/models/league.py` → split into `League` and `LeagueSeason` Pydantic
  models per the field table above; `LeagueMembership.leagueId` → `leagueSeasonId`.
- `api/app/models/pick.py`, `api/app/models/invitation.py` — `leagueId` →
  `leagueSeasonId`.
- `api/app/models/requests.py` — `CreateLeagueRequest` splits into a
  League-creation request (name/description/sportsLeague/logo) and a
  LeagueSeason-creation request (season string, carried from an existing
  League — see Stage D).
- `api/app/db/leagues.py` → split into league-parent CRUD (`leagues.py`) and
  season CRUD (new `league_seasons.py`, replacing `start_new_season()` with the
  Stage D creation flow).
- `api/app/db/_shape.py` — split `league_from_doc`, add
  `league_season_from_doc`, add the flattening join function frontend reads go
  through.
- `api/app/db/memberships.py`, `picks.py`, `invitations.py` — `leagueId` →
  `leagueSeasonId` throughout; `picks.py`'s upsert key becomes
  `{userId, leagueSeasonId, week}`.
- `api/app/db/games.py` — resolve `leagueSeasonId → League.sportsLeague` before
  querying games (extra join hop, no schema change to `Game`).
- `api/app/db/results.py` — `league_id` params → `league_season_id`.
- `api/app/db/game_updater.py` — `_update_league_week_tracking` loops
  `league_seasons` (active ones) instead of `leagues`; season resolution via
  the new join.
- `api/app/db/mongodb.py` — `Collections` enum: add `LEAGUE_SEASONS`, keep
  `LEAGUES` pointed at the new parent collection.
- `api/app/core/auth_deps.py` — `league_id` params → `league_season_id` in
  `get_authorization_context`/`require_league_membership`; re-derive the
  creator-protection check per "Admin/owner re-derivation" above.
- `api/app/routers/` — path segment rename: season-scoped routes move from
  `/api/leagues/{league_id}/...` to `/api/league-seasons/{league_season_id}/...`
  (`members.py`, `results.py`, `invitations.py`'s season-scoped routes,
  `games.py`'s query param, `picks.py`'s body/query field). A **new**, smaller
  `/api/leagues/{league_id}` surface handles parent-level operations: list/get
  League, list its seasons, trigger "create new season" (Stage D).

Add missing indexes while touching these files (currently absent, worth fixing
now rather than as separate scope-creep later): `league_seasons` on
`{leagueId, season}` unique; `league_memberships` on `{leagueSeasonId, userId}`
unique; port `invitations_league_active` → `{leagueSeasonId, isActive}` to
Python (never was ported).

**Stage B is done when**: `cd api && uv run pytest` passes, `GET /health`
boots, and every route manually exercised against the migrated dev DB returns
the same data shape the frontend expects (spot-check via `curl` before moving
to Stage C).

## Stage C — Frontend refactor

Mechanical rename following Stage B's field/route renames — the flattened
response shape means most page components don't need logic changes:

- `types/league.ts` — split `League`/`LeagueSeason` types.
- `types/pick.ts`, `types/invitation.ts` — `leagueId` → `leagueSeasonId`.
- `hooks/use-league.tsx` — `currentLeague` stays the flattened shape;
  `currentMembership.leagueSeasonId` replaces `.leagueId`. `localStorage` key
  can stay `selectedLeagueId` (holds a `LeagueSeason._id` now, same as it
  effectively always meant "the season doc I'm in") — renaming it would just
  force every existing session to bounce through `/leagues` once for no benefit.
- `lib/api-client.ts` — every `leagueId` param renamed to `leagueSeasonId`
  (full list in the explore findings above); URL paths updated to match Stage
  B's router renames.
- `app/leagues/page.tsx`, `app/admin/**`, `app/make-picks`, `app/scoreboard`,
  `app/results`, `app/picks-remaining`, `app/rules`, `app/profile`,
  `app/player`, `app/invite` — param renames only; field *access* patterns
  (`currentLeague.name`, `.sportsLeague`, `.current_pick_week`, etc.) are
  unchanged thanks to the flattened API shape.
- `components/league-guard.tsx`, `admin-guard.tsx` — no logic change expected
  (both key off `currentLeague`/`currentMembership` from the hook).

**Stage C is done when**: full manual walkthrough against the migrated dev
DB — login → select league → make a pick → view scoreboard → admin member
management → invite flow — behaves identically to pre-migration prod.

## Stage D — New "create LeagueSeason" flow (the actual EPL 2026/2027 deliverable)

Replaces `start_new_season()`. Two forms, same underlying db function
(`api/app/db/league_seasons.py`, e.g. `create_league_season(league_id, season, ...)`):

1. **Ops script** — `scripts/create-league-season.ts` (new, or extend
   `create-epl-league.ts`), for the immediate manual "spin up EPL 2026/2027"
   need. Takes a League name (or id) and a season string, looks up the League,
   calls the same creation logic Stage B's admin route will eventually expose.
2. **(Stack this ticket doesn't have to ship, but design for)** an admin-facing
   route/UI action, since this is exactly the operation an admin will want to
   trigger yearly without shelling into an ops script forever. Land the db
   function so this is a thin wrapper later, but a full admin UI is not
   required to close this ticket — the ops script is table stakes.

Creation logic:

1. Look up the League by id, and its `currentSeasonId` → the outgoing
   `LeagueSeason`.
2. Create a new `LeagueSeason`: `leagueId` = parent, `season` = new season
   string, `isActive = true`, week-tracking fields start `null`/`0` (populated
   on the first `update_game_scores()` run once games for that season exist),
   `isPublic`/`requiresApproval`/`hideScoreboard` copied forward from the
   outgoing season (admin can edit after).
3. Mark the outgoing `LeagueSeason.isActive = false`.
4. For each membership in the outgoing season with `status == "active"`,
   create a new `LeagueMembership` under the new season: same `userId`,
   `isAdmin`, `teamName`; `isPaid = false`; `joinedAt = now`; `status =
   "active"` (see "Assumptions" above — confirm before/while implementing).
5. Update `League.currentSeasonId` to the new season's id; append the old
   `currentSeasonId` to `League.pastSeasonIds`.
6. Recompute `LeagueSeason.memberCount` from the carried-over membership count.

**Stage D is done when**: running the ops script against dev for "Tharakan Bros
Survivor League" → 2026/2027 produces a new `LeagueSeason` with all 57 members
carried over correctly (admin flags preserved, `isPaid` reset), the old
2025/2026 season is still fully readable (picks, results, scoreboard) via its
own id, and `League.currentSeasonId`/`pastSeasonIds` are correct.

## Stage E — Test suite updates

- `api/tests/test_game_updater_live_mongo.py`, `test_live_mongo_smoke.py` —
  update to create a `League` + `LeagueSeason` pair instead of a bare `League`.
- `lib/__tests__/scoring.test.ts` — mocked league docs (`leagueId` →
  `leagueSeasonId` in fixtures) so CI doesn't break on the renamed field, even
  though this tests dead-in-prod `lib/scoring.ts` (per SUR-008's Architecture
  Notes) — it still runs in CI and must stay green. **Moot if CR-108 lands
  first**: that ticket deletes both `lib/scoring.ts` and this test file.
- New `api/tests/test_league_seasons.py` (or similar) — live-Mongo test for
  `create_league_season()`'s carryover logic (membership clone, `isPaid` reset,
  `isAdmin` preserved, `League.currentSeasonId`/`pastSeasonIds` update).
- New test for the migration script itself: seed a disposable local Mongo
  (`docker run -d --rm -p 27117:27017 mongo:7`, per the existing
  `test_live_mongo_smoke.py` convention) with an old-shape fixture, run the
  migration script against it, assert Stage A's Phase 3 invariants hold. This
  is what makes "tested thoroughly in dev" durable rather than a one-off manual
  check.

## Stage F — Prod migration

Only after Stage A–E are verified end-to-end against dev:

1. `mongodump` snapshot of prod (manual, before touching anything).
2. Run `scripts/migrate-league-to-leagueseason.ts --allow-prod --dry-run`
   against prod, review output carefully (57-member real league, 1070 picks —
   do not skip reviewing the dry-run diff).
3. Run with `--execute`, then `--verify-only`.
4. Smoke-test the live app against prod immediately after (login, make-picks,
   scoreboard, admin member list) before considering this closed.
5. Do **not** run Stage D's "create EPL 2026/2027" script against prod as part
   of this same pass unless Sameer explicitly confirms it's time — the split
   migration and the actual season rollover are two separate, separately
   confirmable actions even though they'll likely happen close together.

## Out of scope

- Full admin UI for triggering season rollover (Stage D ships the ops script
  and the db function only; a UI button is a future ticket).
- Exposing past-season browsing in the frontend (`pastSeasonIds` is populated
  and queryable, but no page renders it yet — matches the "transparent, no UX
  change" decision).
- Reconstructing historical seasons from `seasonArchive` — there is none in
  real data today (`start_new_season()` never ran), so `pastSeasonIds` starts
  empty and only grows going forward.
- Changing invitation scope to League-level (explicitly decided against —
  stays LeagueSeason-scoped).
- Any change to `Game`'s schema or lookup logic — confirmed unaffected by this
  split.

## Files to modify (summary)

| Area | Files |
|---|---|
| Migration script | `scripts/migrate-league-to-leagueseason.ts` (new) |
| Backend models | `api/app/models/league.py`, `pick.py`, `invitation.py`, `requests.py` |
| Backend db | `api/app/db/leagues.py` (split), new `league_seasons.py`, `_shape.py`, `memberships.py`, `picks.py`, `invitations.py`, `games.py`, `results.py`, `game_updater.py`, `mongodb.py` |
| Backend routers/auth | `api/app/routers/leagues.py`, `members.py`, `results.py`, `invitations.py`, `games.py`, `picks.py`, `admin_scoring.py`, `api/app/core/auth_deps.py` |
| Frontend types | `types/league.ts`, `pick.ts`, `invitation.ts` |
| Frontend hook/client | `hooks/use-league.tsx`, `lib/api-client.ts` |
| Frontend pages | `app/leagues/page.tsx`, `app/admin/**`, `app/make-picks`, `app/scoreboard`, `app/results`, `app/picks-remaining`, `app/rules`, `app/profile`, `app/player`, `app/invite` |
| Ops scripts (TS twin) | `lib/db.ts`, `scripts/init-db.ts`, `scripts/create-epl-league.ts` — decide per the CR-108 note above whether these get updated to the new shape, replaced by `scripts/create-league-season.ts`, or knowingly left stale; `scripts/clone-prod-to-dev.ts` (see note below). (`lib/scoring.ts`/`lib/game-updater.ts` dropped from this row — see CR-108.) |
| Tests | `api/tests/test_game_updater_live_mongo.py`, `test_live_mongo_smoke.py`, new `test_league_seasons.py`, new migration-script test, `lib/__tests__/scoring.test.ts` |

### Note: `scripts/clone-prod-to-dev.ts`

This script has its **own hardcoded copy** of the `Collections` map
(`scripts/clone-prod-to-dev.ts:13-23`, explicitly commented `// Mirror the
Collections enum from lib/mongodb.ts`) — it does not import it, so Stage B's
`Collections` update elsewhere does **not** automatically reach this file. Add
`LEAGUE_SEASONS: 'league_seasons'` to its local map as part of Stage B. Nothing
else in the script needs to change — it's fully generic per-collection (drop
dev copy → bulk-copy docs → copy indexes, with sanitization only applied to
`users`), no League-specific logic exists here.

**Ordering caveat**: this script clones prod → dev wholesale, dropping each
dev collection first. Don't run it between Stage A (dev migrated) and Stage F
(prod migrated) — prod is still old-shape during that window, and running it
would silently overwrite the migrated dev data with a fresh copy of prod's
pre-migration `leagues` collection, undoing Stage A's verification work. Safe
to run again once Stage F is complete (source and target are both new-shape by
then).

## Verification checklist

1. Stage A dry-run + execute + verify against dev — passes cleanly.
2. Stage B: `uv run pytest` green; manual `curl` spot checks match pre-migration
   data.
3. Stage C: full manual click-through (login → league select → pick → scoreboard
   → admin → invite) against migrated dev, matches pre-migration behavior.
4. Stage D: create EPL 2026/2027 against dev; confirm member carryover, admin
   flags, `isPaid` reset, old season still fully readable.
5. Stage E: all new/updated tests green, including the migration-script test
   against a disposable Mongo.
6. Stage F: prod migration executed with a pre-migration `mongodump` snapshot
   in hand, dry-run reviewed before execute, post-migration smoke test passes.
7. Explicit re-check of the creator-protection permission rule
   (`auth_deps.py`) post-split — this is a security-relevant check, don't let
   it silently regress into "always allow" or "always deny" during the
   two-hop-lookup rewrite.
