# SUR-008: Postponed/Rescheduled Game Handling

**Ticket ID**: SUR-008
**Title**: Handle Postponed and Rescheduled Games in Week Calculations
**Type**: Bug Fix / Feature
**Priority**: High
**Status**: Confirmed still open as of 2026-08-09. Rewritten to target the current
architecture — the app migrated from Next.js API routes to a Python/FastAPI backend
(`api/app/`, motor/pymongo, Pydantic models) with a statically-exported Next.js
frontend, per `tickets/done/CR-106-frontend-static-export-cutover.md`. The bug
originally reported in `lib/game-updater.ts` (deleted along with all of `app/api/*`
and `middleware.ts` in CR-106) has an identical twin in its Python port,
`api/app/db/game_updater.py`, and **that port is the live production code path
today** — see Evidence below. This is a rewrite of the implementation plan for
accuracy against the current codebase; the underlying bug analysis and design from
the original ticket are still valid.

## Status verification (2026-08-09) — evidence the bug is still present

- **`api/app/db/game_updater.py:88-96`** — `_map_api_status_to_internal` (the direct
  Python port of the old `mapApiStatusToInternal`) still maps `POSTPONED`,
  `CANCELLED`, and `SUSPENDED` into the same branch as `FINISHED`/`AWARDED`,
  returning `"completed"`:
  ```python
  if api_status in ("FINISHED", "AWARDED", "POSTPONED", "CANCELLED", "SUSPENDED"):
      return "completed"
  ```
  This is the exact same bug, carried over faithfully during the CR-105 port (the
  module docstring at `game_updater.py:1-12` explicitly says the port's only two
  authorized fixes were Pick draw-handling and a League typing issue — this bug was
  out of scope then and was never touched).

- **This is not dead code — it is the current live production path**, which raises
  the practical urgency versus when the original ticket was written against a
  Next.js API route that a browser request would hit. Confirmed call chain:
  `scripts/update-game-scores.js` (a Node HTTP-client script meant to run on a
  Heroku Scheduler-style cron, reads `SCORING_API_KEY`) → POSTs to
  `${API_BASE_URL}/api/admin/update-game-scores` → routed by the single Heroku dyno
  (`Procfile`: `web: cd api && uv run ... uvicorn app.main:app ...`) to
  `api/app/routers/admin_scoring.py:28-32`'s `update_game_scores_route`, which calls
  `api/app/db/game_updater.py`'s `update_game_scores()` directly — the exact function
  containing the bug above. There is no longer any Next.js route in this path at
  all; `app/api/` was deleted wholesale in CR-106.

- **`api/app/models/game.py:11`** — `GameStatus = Literal["not_started",
  "in_progress", "completed"]`. No `"postponed"` value exists yet. The `Game` model
  (`game.py:24-36`) has no `isPostponed` or `originalWeek` fields.

- **`api/app/models/pick.py:22`** — `result: Optional[Literal["win", "draw",
  "loss"]]`. **`"draw"` has already been added** (landed as part of the CR-105 port,
  per the file's own docstring — a pre-existing TS/runtime drift bug, not part of
  this ticket's scope). `"dnp"` is still missing.

- **`api/app/db/scoring.py`** — `calculate_pick_result` (line 19-38) still returns
  `None` for any game whose `status != "completed"`, and `calculate_scores_and_strikes`
  (line 70-134) has no branch referencing `"dnp"` anywhere. No DNP handling exists.

- **`api/app/utils/game_utils.py:57-79`** — `compute_game_status` has no branch for a
  `"postponed"` stored status; it would fall through to the time-based
  not_started/in_progress/completed computation, which is wrong for a postponed game
  (see Architecture Notes below for why this matters more than it looks).

- **`app/rules/page.tsx:251-255`** — the published rules describing the
  before/after-gameweek-start behavior are unchanged and still have zero
  implementation anywhere in the codebase (`grep -rn "postponed\|isPostponed\|dnp"`
  across `api/app` and the frontend turns up nothing but this bug and these two
  files).

- **`types/game.ts:4`** and **`types/pick.ts:9`** — same gaps as their Python
  counterparts: `GameStatus` has no `"postponed"`; `Pick.result` is `"win" | "loss" |
  "draw" | null` (draw already present, `"dnp"` missing).

- **`lib/game-utils.ts:20-57`** — `computeGameStatus` also has no `"postponed"`
  branch. Unlike `lib/game-updater.ts` (see Architecture Notes), this file **is
  still live** — imported by `app/make-picks/page.tsx` and `app/scoreboard/page.tsx`
  in the current statically-exported frontend.

Bottom line: the bug and the missing feature are exactly as described in the
original ticket, just living in a different file than the one it named, and on a
path that is now hit by an unattended cron job hitting production data rather than
an ad hoc API route.

## Problem

When a game gets rescheduled (e.g., moved 4 weeks later due to weather or cup
advancement), the current system breaks in several ways:

1. **`last_completed_week` gets stuck on a zombie state** — a postponed game in
   week 20 gets miscategorized as `completed` (see bug below) with null scores, so
   week 20 never resolves cleanly and downstream scoring stalls on it.
2. **`current_pick_week` can be affected** — because the postponed game is
   (incorrectly) marked `completed` instead of a distinct `postponed` status, it's
   silently excluded from the `not_started` aggregation that drives
   `current_pick_week`, which can make the system compute the wrong next pick week
   once the real fix (a distinct `postponed` status) is introduced and needs its own
   exclusion handling.
3. **`missing_pick_strikes` are wrong** — since the postponed game reads as
   `completed`, `last_completed_week` can advance past a week that isn't really
   resolved, or (once picks never resolve, see below) a user's pick sits at
   `result: None` forever and never counts toward `weeks_with_picks`, eventually
   producing a false missing-pick strike.
4. **The core bug**: `_map_api_status_to_internal` at `api/app/db/game_updater.py:94`
   maps `POSTPONED` → `"completed"`, creating a "completed" game with null scores.

Published rules already exist on the rules page (`app/rules/page.tsx:253-254`) but
have zero implementation:
- **Before gameweek starts**: Game is unpickable. Rescheduled match also not
  pickable.
- **After gameweek starts**: Marked as DNP (Did Not Play). Results backfilled when
  the game is eventually replayed, applied to the original week.

### Existing bug detail

`_map_api_status_to_internal` in `api/app/db/game_updater.py:88-96` is the Python
port of the original TS switch statement. The bug: `POSTPONED`, `CANCELLED`, and
`SUSPENDED` all map into the same case as `FINISHED`/`AWARDED`:

```python
# api/app/db/game_updater.py:88-96
def _map_api_status_to_internal(api_status: str) -> str:
    """Port of lib/game-updater.ts:80-99."""
    if api_status in ("SCHEDULED", "TIMED"):
        return "not_started"
    if api_status in ("LIVE", "IN_PLAY", "PAUSED", "HALFTIME"):
        return "in_progress"
    if api_status in ("FINISHED", "AWARDED", "POSTPONED", "CANCELLED", "SUSPENDED"):
        return "completed"   # BUG: POSTPONED/CANCELLED/SUSPENDED should not land here
    return "not_started"
```

**Effect**: When the Football Data API reports `POSTPONED`, the game gets written to
MongoDB with `status: "completed"` but `homeScore: None, awayScore: None`. This
creates a zombie state:
- `calculate_pick_result` in `api/app/db/scoring.py:19-38` checks
  `game.get("status") != "completed" or game.get("homeScore") is None` and returns
  `None` — so any pick on this game can never resolve.
- The user's pick stays with `result: None` forever, and eventually they get a false
  missing-pick strike because the pick doesn't count in `weeks_with_picks`
  (`api/app/db/scoring.py:99`).
- Meanwhile `_calculate_last_completed_week`
  (`api/app/db/game_updater.py:309-322`) thinks the week is done (since the game
  reads as `"completed"`), so it advances past a week with an unresolved game.

This function is **not exported / module-private** (leading-underscore convention,
same as its TS ancestor). To unit-test it directly it needs to become importable
from a test module — it already is, technically (Python has no real privacy), but
treat the underscore as a signal to the test file's docstring, same convention
`test_game_utils_parity.py` already follows for the other `_`-prefixed
`game_updater.py` helpers it doesn't currently test.

## Architecture notes (why this rewrite differs from the original plan)

1. **`lib/game-updater.ts` and `lib/scoring.ts` are now dead code in production.**
   `app/api/*` was deleted in CR-106, so nothing serves those old Next.js routes
   anymore. The only remaining importer of `lib/game-updater.ts` is
   `scripts/update-games.ts`, a standalone `tsx` script with no wiring to any
   scheduler — it's a manual/local-dev-only path. The actual production cron jobs
   are `scripts/update-game-scores.js` and `scripts/calculate-scores.js`, both plain
   Node HTTP clients that POST to `/api/admin/update-game-scores` and
   `/api/admin/recompute-scores` — i.e. **they call the Python backend**, not the TS
   library. Fixing `lib/game-updater.ts`/`lib/scoring.ts` would have **zero effect on
   production behavior**. This ticket does not touch them; see "Out of scope" below.
   (`lib/__tests__/scoring.test.ts` exists and exercises `lib/scoring.ts` — also now
   testing dead code. Left alone, not expanded.)

2. **`lib/game-utils.ts` is NOT dead code** — unlike the two files above, it's
   imported directly by `app/make-picks/page.tsx` and `app/scoreboard/page.tsx`,
   both very much live in the statically-exported frontend. It still needs the
   `"postponed"` treatment from the original plan.

3. **Parity requirement.** Per `tickets/done/CR-105-FINDINGS.md` (Table 2 / Addendum
   2), 5 of `lib/game-utils.ts`'s 11 exports were ported to Python
   (`api/app/utils/game_utils.py`) because they have real server-side consumers
   (`compute_game_status`, `can_pick_from_game`, `can_change_existing_pick`,
   `has_gameweek_started`, `are_picks_locked`), and a golden-fixture parity test
   (`test-fixtures/game-utils-golden.json`, consumed by both
   `lib/__tests__/game-utils-parity.test.ts` and `api/tests/test_game_utils_parity.py`)
   asserts both languages produce identical booleans for identical inputs. **Any
   change to `compute_game_status`'s postponed handling must be made in both
   `lib/game-utils.ts` and `api/app/utils/game_utils.py`, plus a new fixture case
   added to `test-fixtures/game-utils-golden.json`**, or the parity test suite will
   not catch drift (it will just keep passing on stale fixtures — it does not
   independently know a case is "missing"). The other 6 exports
   (`getGameStatusDisplay`, `isGameDisabled`, `getGameCardClasses`,
   `getTeamSelectionClasses`, `canMakeFirstPick`, `shouldDisablePickChanges`) are
   pure UI-rendering helpers with no Python counterpart and no parity requirement —
   TS-only changes.

4. **Blocking picks on postponed games is now simpler than the original plan
   assumed.** The original ticket's step 7 targeted `app/api/picks/route.ts`
   (deleted) with a dedicated new validation check. The current
   `api/app/routers/picks.py:66-91` pick-creation flow already calls
   `can_pick_from_game(game_time_info)` (from `api/app/utils/game_utils.py`) before
   allowing a pick, both on the "gameweek started, no existing pick" branch and the
   "gameweek not started" branch. Once `compute_game_status` gets an early-return for
   `"postponed"` (returning `"postponed"`, which is `!= "not_started"`),
   `can_pick_from_game` automatically returns `False` for postponed games with **no
   separate blocking check needed** in `routers/picks.py` or `db/picks.py`. This
   collapses what was two separate implementation steps (game-utils change + route
   check) into one.

5. **SUR-007-A / CR-105's `"draw"` fix already covers half of the original step 2.**
   `Pick.result` in `api/app/models/pick.py` already includes `"draw"` — that part of
   the original ticket is done. Only `"dnp"` still needs adding, to both
   `api/app/models/pick.py` and `types/pick.ts` (`types/pick.ts` has not been
   touched — it's still `"win" | "loss" | "draw" | null` in the frontend type, so add
   `"dnp"` there too even though it wasn't drifted from Python the way the Python
   side once was from the DB).

6. **No mocking library for MongoDB exists in the Python test suite.** `api/tests/`
   has no `mongomock` or similar — the only established pattern for a test that
   touches the database is `test_live_mongo_smoke.py`'s
   skip-if-`MONGODB_URI`-unset-else-use-a-real-disposable-database approach (see that
   file's docstring for exact instructions: `docker run -d --rm -p 27117:27017
   mongo:7`, etc.). Pure-function pieces of this ticket (`_map_api_status_to_internal`,
   `compute_game_status`) can use ordinary parametrized `pytest` with no DB. The
   DB-touching pieces (`_calculate_last_completed_week`'s postponed exclusion,
   `_update_game_in_database`'s pick-deletion/DNP-marking on postponement, DNP
   backfill in scoring) need a new `api/tests/test_game_updater_live_mongo.py` (or
   similar) following the live-Mongo pattern, not a mocked unit test — there's
   nothing in this codebase to mock MongoDB with today, and introducing one is out of
   this ticket's scope.

## Implementation Steps

### 1. Add `"postponed"` status and new fields — both type layers

**File: `api/app/models/game.py`**
- Change `GameStatus = Literal["not_started", "in_progress", "completed"]` to add
  `"postponed"`.
- Add optional fields to `Game`: `isPostponed: Optional[bool] = None`,
  `originalWeek: Optional[int] = None`.

**File: `types/game.ts`** (still live — imported by `app/make-picks/page.tsx`,
`lib/api-client.ts`, `lib/game-utils.ts`, `app/profile/page.tsx` transitively via
`Pick`)
- Add `"postponed"` to `GameStatus`.
- Add optional fields to `Game`: `isPostponed?: boolean`, `originalWeek?: number`.

**File: `api/app/db/_shape.py`** — `game_from_doc` (line 32-60) currently doesn't
pass `isPostponed`/`originalWeek` through from the Mongo doc to the `Game` model at
all; add `isPostponed=doc.get("isPostponed")`, `originalWeek=doc.get("originalWeek")`
so the frontend actually receives these fields once they exist.

### 2. Add `"dnp"` to Pick result — both type layers

**File: `api/app/models/pick.py`**
- Change `result: Optional[Literal["win", "draw", "loss"]]` to add `"dnp"`. (`"draw"`
  is already present — do not re-add it, just extend the union.)

**File: `types/pick.ts`**
- Change `result: "win" | "loss" | null` to `"win" | "loss" | "draw" | "dnp" | null`
  (this file never got the `"draw"` fix that `api/app/models/pick.py` got — add both
  in one pass rather than assuming `"draw"` is already there on the frontend side).

### 3. Fix API status mapping and add postponement detection

**File: `api/app/db/game_updater.py`**

a) **Fix `_map_api_status_to_internal` (line 88-96)**: map `POSTPONED` →
   `"postponed"` instead of `"completed"`. Map `CANCELLED` and `SUSPENDED` →
   `"postponed"` as well.

b) **Add date-drift detection in `_update_game_in_database` (line 218-264)**: after
   computing `new_start_time`, check if the game's new date has drifted >14 days from
   the median date of other games in the same week+sportsLeague+season. If so, mark
   as postponed even if the API status is `SCHEDULED`/`TIMED`.

c) **Add postponement handling logic**: when a game's status transitions TO
   `"postponed"` (mirror the existing `status_changed_to_completed` boolean pattern
   at line 228 with a `status_changed_to_postponed` counterpart):
   - Set `isPostponed = True` and `originalWeek = db_game["week"]` on the game
     document's `$set`.
   - Find any existing picks for this `gameId`.
   - Check whether the gameweek has started (compare the game's `week` against the
     owning league's `current_game_week` — reuse `has_gameweek_started` from
     `api/app/utils/game_utils.py` rather than re-implementing the comparison).
   - If the gameweek has started → set those picks' `result = "dnp"`.
   - If the gameweek has NOT started → delete those picks (users need to re-pick a
     different team).
   - Note: `_update_game_in_database` currently has no league context (it operates
     purely on `db_game`/`api_game`); it will need to look up the owning league (by
     `db_game["sportsLeague"]`/`db_game["season"]`) to call `has_gameweek_started`.

d) **Handle un-postponement**: when a game transitions FROM `"postponed"` back to
   `"not_started"` (API sends `SCHEDULED`/`TIMED` again with a new date), keep
   `originalWeek` and `isPostponed = True` (it's still a rescheduled match). The
   game's `week` field stays at the original value.

### 4. Exclude postponed games from week calculations

**File: `api/app/db/game_updater.py`**

- **`_calculate_current_game_week` (line 289-296)**: no change needed —
  `"postponed"` is neither `"in_progress"` nor `"completed"`, so it's already
  excluded from this `$match`.
- **`_calculate_current_pick_week` (line 299-306)**: no change needed — since the
  status fix in step 3a changes the mapped status to `"postponed"` (not
  `"not_started"`), these games no longer match `status: "not_started"` and are
  already excluded.
- **`_calculate_last_completed_week` (line 309-322)**: exclude `"postponed"` games
  from the aggregation's initial `$match` (currently just `{"sportsLeague":
  sports_league, "season": season}` with no status filter) — add `"status": {"$ne":
  "postponed"}`. This is what unblocks a postponed game in week 20 from preventing
  week 20 from being counted as fully completed.

### 5. Update shared game status utilities (both languages — parity requirement)

**Files: `api/app/utils/game_utils.py` AND `lib/game-utils.ts`** (make the same
change in both; add a fixture case to `test-fixtures/game-utils-golden.json` — see
Architecture Notes item 3)

- **`compute_game_status` / `computeGameStatus`**: add an early return for
  `"postponed"` — if `game.status == "postponed"`, return `"postponed"` (same
  pattern as the existing early return for `"completed"`).
- **`can_pick_from_game` / `canPickFromGame`**: no code change needed — already
  returns `False` for anything other than `"not_started"`, and now automatically
  covers postponed games once `compute_game_status` is fixed (see Architecture Notes
  item 4).

**File: `lib/game-utils.ts` only** (TS-only helpers, no Python counterpart, no
parity fixture needed):
- **`getGameStatusDisplay`**: add a case for `"postponed"` — label "POSTPONED",
  amber/yellow styling. Note this function's `switch` has no `default` case today
  and TS type-checking is disabled project-wide (`ignoreBuildErrors: true` per
  CLAUDE.md), so a missing case would previously fail silently at runtime
  (`undefined` return) rather than at build time — don't skip this just because the
  build wouldn't have caught it.
- **`isGameDisabled`**: add `"postponed"` to the disabled set.
- **`getGameCardClasses`**: distinct styling for postponed (e.g. amber/yellow
  border, "POSTPONED" overlay).
- **`getTeamSelectionClasses`**: treat postponed games as disabled.

### 6. Update scoring to handle DNP

**File: `api/app/db/scoring.py`**

- **`update_pick_results` (line 41-67)**: no change needed for the "skip
  postponed" half — it already only ever looks at picks with `result: None`
  (`db[Collections.PICKS].find({"result": None})`, line 48), and
  `calculate_pick_result` already returns `None` for any non-`"completed"` game
  (including the now-correctly-tagged `"postponed"` ones), so a postponed game's
  pick is already left alone by this function as written. **New logic needed**: a
  backfill path for picks that already have `result: "dnp"` whose game has since
  become `"completed"` — this function's current query (`result: None`) will never
  find them. Add a second query for `{"result": "dnp"}` joined to their game, and
  recompute via `calculate_pick_result` when the game is now `"completed"`.
- **`calculate_scores_and_strikes` (line 70-134)**:
  - Line 92-97's picks query (`"result": {"$ne": None}`) already includes `"dnp"`
    picks — correct, no change.
  - Line 99's `weeks_with_picks` count already counts `"dnp"` picks (any pick
    matched by the query above, regardless of which non-null result it holds) —
    correct, no change, this is what prevents the false missing-pick strike.
  - Line 104-110's if/elif chain (`"win"` → +3, `"draw"` → +1, `"loss"` → +1 strike)
    has no branch for `"dnp"` and falls through doing nothing — which is already the
    correct behavior (0 points, 0 strikes) but is implicit/accidental rather than
    stated. Add an explicit `elif pick["result"] == "dnp": pass` with a comment, so
    the "0 points and 0 strikes for DNP" behavior is a documented decision instead
    of "happens not to match any branch."

### 7. Pick creation — no dedicated blocking step needed

Per Architecture Notes item 4, `api/app/routers/picks.py`'s existing
`can_pick_from_game` calls (lines 83 and 90) already block postponed games once step
5's `compute_game_status` fix lands — no new file/step required here. (The original
ticket's step 7, targeting the now-deleted `app/api/picks/route.ts`, is superseded by
this.)

### 8. Update make-picks UI

**File: `app/make-picks/page.tsx`** (confirmed still current — imports
`computeGameStatus`, `getGameStatusDisplay`, `getGameCardClasses`,
`getTeamSelectionClasses`, `canPickFromGame` etc. from `lib/game-utils.ts` at
lines 16-25, renders them starting around line 442)

- Postponed games should render with a "POSTPONED" badge (via the updated
  `getGameStatusDisplay`) and distinct styling (via the updated
  `getGameCardClasses`/`getTeamSelectionClasses`), consuming the changes from step 5.
- They should not be selectable (already follows automatically from
  `canPickFromGame`/`isGameDisabled` once step 5 lands, same as step 7's reasoning).
- Consider surfacing `originalWeek` in the UI when `isPostponed` is set, so users
  understand why a game they expected to see is missing from the current week's list
  (optional/nice-to-have — not blocking for the core fix).

## Out of scope (do not modify)

- **`lib/game-updater.ts`, `lib/scoring.ts`, `scripts/update-games.ts`** — dead in
  production (see Architecture Notes item 1). Fixing the TS `mapApiStatusToInternal`
  twin here would be harmless but pointless — nothing in production calls it.
  Leaving these unfixed is intentional, not an oversight; flag as a separate cleanup
  ticket (deletion candidate) if desired, but that's not this ticket.
- **`lib/__tests__/scoring.test.ts`** — tests the dead `lib/scoring.ts`; not
  extended by this ticket.
- **`app/api/*`, `middleware.ts`** — already deleted in CR-106; not coming back.

## Files to Modify

| File | Changes |
|------|---------|
| `api/app/models/game.py` | Add `"postponed"` to `GameStatus`, add `isPostponed`/`originalWeek` fields |
| `api/app/models/pick.py` | Add `"dnp"` to `result` union (`"draw"` already present) |
| `api/app/db/_shape.py` | `game_from_doc`: pass `isPostponed`/`originalWeek` through from the Mongo doc |
| `api/app/db/game_updater.py` | Fix `_map_api_status_to_internal` (line 94), add date-drift detection + postponement pick handling in `_update_game_in_database` (line 218), exclude postponed from `_calculate_last_completed_week` (line 309) |
| `api/app/utils/game_utils.py` | `compute_game_status`: early-return for `"postponed"` |
| `api/app/db/scoring.py` | `update_pick_results`: add DNP-backfill query/recalc path; `calculate_scores_and_strikes`: explicit `"dnp"` branch (0 pts/0 strikes) |
| `types/game.ts` | Add `"postponed"` to `GameStatus`, add `isPostponed`/`originalWeek` fields |
| `types/pick.ts` | Add `"draw"` and `"dnp"` to `result` union (neither present today on this file) |
| `lib/game-utils.ts` | `computeGameStatus`: early-return for `"postponed"` (parity with Python); `getGameStatusDisplay`, `isGameDisabled`, `getGameCardClasses`, `getTeamSelectionClasses`: handle `"postponed"` (TS-only, no parity requirement) |
| `app/make-picks/page.tsx` | Visual treatment for postponed games (badge, styling) — consumes `lib/game-utils.ts` changes, no new logic of its own beyond optionally surfacing `originalWeek` |
| `test-fixtures/game-utils-golden.json` | Add postponed-status case(s), consumed by both parity suites |
| `api/app/routers/picks.py` | **No change** — already blocked automatically, see step 7 |
| `lib/game-updater.ts`, `lib/scoring.ts` | **No change** — dead code, out of scope, see above |

## Key Behavior Summary

| Scenario | What Happens |
|----------|-------------|
| Game postponed **before** gameweek starts | Game marked `postponed`, any existing picks deleted, game unpickable |
| Game postponed **after** gameweek starts | Game marked `postponed`, existing picks set to `result: "dnp"` |
| DNP pick during scoring | Counts as "having a pick" (no missing-pick strike), awards 0 points and 0 strikes |
| Postponed game eventually replayed and completed | `"dnp"` picks overwritten with actual result (`win`/`loss`/`draw`), scoring recalculates |
| API silently moves game date without `POSTPONED` status | Date-drift detection (>14 days from week median) catches it |

## Testing

Two parallel suites, following the golden-fixture parity pattern established in
CR-105/CR-106 (`lib/__tests__/game-utils-parity.test.ts` ↔
`api/tests/test_game_utils_parity.py`, both reading
`test-fixtures/game-utils-golden.json`) rather than the original ticket's
Jest-only plan, since the behavioral logic that matters for scoring/week-tracking
now lives in Python and the old TS equivalents are dead code (see Architecture
Notes).

### Python (`api/tests/`) — primary suite, run with `pytest` from `api/`

**Pure-function tests, no DB needed — extend or add alongside `test_game_utils_parity.py`:**

1. **`_map_api_status_to_internal` tests** (new file, e.g.
   `api/tests/test_game_updater_status_mapping.py`):
   - `POSTPONED` → `"postponed"`
   - `CANCELLED` → `"postponed"`
   - `SUSPENDED` → `"postponed"`
   - `FINISHED` → `"completed"` (unchanged)
   - `SCHEDULED` → `"not_started"` (unchanged)

2. **`compute_game_status` parity case** — add a `"postponed"` case to
   `test-fixtures/game-utils-golden.json`'s `gameStatusCases` (e.g. `{"game":
   {"status": "postponed", "startTime": <any time>}, "expectStatus": "postponed",
   "expectCanPick": false, "expectCanChange": <per existing time-only
   `can_change_existing_pick` semantics — note this function deliberately does NOT
   consult `status`, so decide/document the expected value here explicitly since it
   won't fall out "for free" from the postponed-status fix>}`). This one fixture case
   is exercised by both `test_game_utils_parity.py` and
   `game-utils-parity.test.ts` automatically — no separate test code needed in
   either file, just the fixture entry.

**DB-touching tests — new file following the `test_live_mongo_smoke.py` pattern
(skips cleanly if `MONGODB_URI` is unset; needs a real disposable Mongo instance,
see that file's docstring for the `docker run mongo:7` invocation):**

3. **`_calculate_last_completed_week` with a postponed game**:
   - Week with all games `completed` → returns that week (unchanged behavior,
     regression check).
   - Week with one game `postponed` and the rest `completed` → still returns that
     week (postponed excluded from the `$ne` filter).
   - Week with one game `not_started` and the rest `completed` → does NOT return
     that week (unchanged behavior, regression check).

4. **Postponement pick-handling in `_update_game_in_database`**:
   - Game transitions to `postponed` before the owning league's gameweek has started
     → existing picks for that game are deleted.
   - Game transitions to `postponed` after the gameweek has started → existing
     picks for that game get `result: "dnp"`, and `isPostponed`/`originalWeek` are
     set on the game document.

5. **DNP backfill in `update_pick_results`**:
   - A pick with `result: "dnp"` whose game is still `postponed` → left alone
     (not yet resolvable).
   - A pick with `result: "dnp"` whose game has since become `completed` with scores
     → recalculated to the actual `win`/`draw`/`loss` result.

6. **`calculate_scores_and_strikes` with DNP picks**:
   - A membership with a `"dnp"` pick → 0 points, 0 strikes contributed by that pick.
   - A `"dnp"` pick counts toward `weeks_with_picks` → no missing-pick strike for
     that week.
   - A mix of `"win"`, `"dnp"`, `"loss"` picks → correct aggregate totals.

7. **Date-drift detection** (if implemented per step 3b):
   - Game date >14 days from the week's median date, API status still
     `SCHEDULED`/`TIMED` → detected and marked `postponed`.
   - Game date within 14 days → not flagged.
   - Game already marked `postponed` → no duplicate detection/re-processing.

### Frontend (Jest) — only for logic that still lives in the frontend

`lib/game-utils.ts` is the only frontend file with real logic changes (everything
else in `lib/game-updater.ts`/`lib/scoring.ts` is dead code, see Architecture
Notes) — its 5 parity-relevant functions are covered by the shared golden fixture
via `lib/__tests__/game-utils-parity.test.ts` (item 2 above covers both languages
from one fixture addition). Add plain Jest tests only for the TS-only rendering
helpers not covered by the parity fixture:

- `lib/__tests__/game-utils.test.ts` (new file):
  1. `getGameStatusDisplay("postponed")` → returns the correct label/className.
  2. `isGameDisabled` with a `status: "postponed"` game → returns `true`.
  3. `getGameCardClasses` / `getTeamSelectionClasses` with a postponed game →
     return the distinct/disabled styling.

### Running tests

```bash
# Python (from api/)
cd api && uv run pytest                                  # all tests
cd api && uv run pytest tests/test_game_utils_parity.py  # parity only
MONGODB_URI=mongodb://localhost:27117 MONGODB_DB_NAME=survivor-sur008-test \
  uv run pytest tests/test_game_updater_live_mongo.py -q # DB-touching tests

# Frontend (from repo root)
npm test                                # run all Jest tests
npm test -- game-utils                  # game-utils + parity tests only
```

## Verification

1. **Week calculations unblocked**: mark a game as `postponed` in the DB (against a
   disposable/dev database, not prod), trigger week tracking (`_update_league_week_tracking`,
   reachable via `POST /api/admin/update-game-scores` with `X-API-Key:
   $SCORING_API_KEY`, or a direct Python call in a REPL/test) — verify
   `last_completed_week` advances past that week.
2. **Pre-gameweek postponement**: set a game to `postponed` before the gameweek
   starts — verify picks for that game are deleted and the game is unpickable
   (`GET` game status via the frontend or `can_pick_from_game`).
3. **Post-gameweek postponement (DNP)**: create a pick on a game, advance the
   league's `current_game_week`/`current_pick_week` past it, then mark the game
   `postponed` — verify the pick gets `result: "dnp"`, no strike assessed, no points
   awarded.
4. **Backfill on replay**: complete the previously-postponed game with scores —
   verify the `"dnp"` pick gets overwritten with the actual result and
   `POST /api/admin/recompute-scores` recalculates correctly.
5. **Date-drift detection** (if implemented): change a game's `startTime` to 3 weeks
   later without changing the API status — verify the system detects and flags it as
   postponed on the next `update_game_scores()` run.
6. **Missing-pick strikes**: verify users who had a DNP pick are NOT charged a
   missing-pick strike for that week (`calculate_scores_and_strikes` /
   `POST /api/admin/recompute-scores`).
7. **Frontend rendering**: load `/make-picks` for a league with a postponed game
   (against a dev/local backend, not prod) and confirm the "POSTPONED" badge, amber
   styling, and non-selectability render correctly.
8. **Parity**: run both `npm test -- game-utils-parity` and
   `cd api && uv run pytest tests/test_game_utils_parity.py` after adding the new
   fixture case — both must pass against the same fixture file.
