# SUR-008: Postponed/Rescheduled Game Handling

**Ticket ID**: SUR-008
**Title**: Handle Postponed and Rescheduled Games in Week Calculations
**Type**: Bug Fix / Feature
**Priority**: High

## Problem

When a game gets rescheduled (e.g., moved 4 weeks later due to weather or cup advancement), the current system breaks in several ways:

1. **`lastCompletedWeek` gets stuck** — a postponed game in week 20 stays `not_started`, so week 20 never counts as "completed," blocking all downstream scoring
2. **`currentPickWeek` pulls backwards** — the `not_started` postponed game makes the system think an old week is the next pick week
3. **`missingPickStrikes` are wrong** — because `lastCompletedWeek` is stuck, strike calculations stall
4. **Existing bug** — `mapApiStatusToInternal` at `lib/game-updater.ts:92` maps `POSTPONED` → `"completed"`, creating a "completed" game with null scores

Published rules already exist on the rules page (`app/rules/page.tsx:253-254`) but have zero implementation:
- **Before gameweek starts**: Game is unpickable. Rescheduled match also not pickable.
- **After gameweek starts**: Marked as DNP (Did Not Play). Results backfilled when the game is eventually replayed, applied to the original week.

### Existing Bug Detail

The function `mapApiStatusToInternal` in `lib/game-updater.ts:80-99` is a switch statement that maps Football Data API status strings to our internal `GameStatus`. The bug is that `POSTPONED`, `CANCELLED`, and `SUSPENDED` all fall through to the same `case` as `FINISHED`:

```typescript
// lib/game-updater.ts:80-99
function mapApiStatusToInternal(apiStatus: string): GameStatus {
  switch (apiStatus) {
    case 'SCHEDULED':
    case 'TIMED':
      return 'not_started'
    case 'LIVE':
    case 'IN_PLAY':
    case 'PAUSED':
    case 'HALFTIME':
      return 'in_progress'
    case 'FINISHED':
    case 'AWARDED':
    case 'POSTPONED':    // BUG: maps to 'completed'
    case 'CANCELLED':    // BUG: maps to 'completed'
    case 'SUSPENDED':    // BUG: maps to 'completed'
      return 'completed'
    default:
      return 'not_started'
  }
}
```

**Effect**: When the Football Data API reports `POSTPONED`, the game gets written to MongoDB with `status: "completed"` but `homeScore: null, awayScore: null`. This creates a zombie state:
- `calculatePickResult` in `lib/scoring.ts:12` checks `game.status !== "completed" || game.homeScore === null` and returns `null` — so any pick on this game can never resolve
- The user's pick stays with `result: null` forever, and eventually they get a false missing-pick strike because the pick doesn't count in `weeksWithPicks`
- Meanwhile `calculateLastCompletedWeek` thinks the week is done (since the game is "completed"), so it advances past a week with an unresolved game

This function is **not exported** (module-private). To test it directly, it needs to be exported.

## Implementation Steps

### 1. Update Game type — add `"postponed"` status and new fields

**File: `types/game.ts`**
- Add `"postponed"` to `GameStatus`: `"not_started" | "in_progress" | "completed" | "postponed"`
- Add optional fields to `Game` type: `isPostponed?: boolean`, `originalWeek?: number`

### 2. Update Pick type — add `"dnp"` and `"draw"` result

**File: `types/pick.ts`**
- Change result to: `"win" | "loss" | "draw" | "dnp" | null`
- Note: `"draw"` is already used in scoring code but missing from this type definition — fix that too

### 3. Fix API status mapping and add postponement detection

**File: `lib/game-updater.ts`**

a) **Fix `mapApiStatusToInternal` (line 92)**: Map `POSTPONED` → `"postponed"` instead of `"completed"`. Map `CANCELLED` and `SUSPENDED` → `"postponed"` as well.

b) **Add date-drift detection in `updateGameInDatabase` (line 246)**: After updating `startTime`, check if the game's new date has drifted >14 days from the median date of other games in the same week+sportsLeague+season. If so, mark as postponed even if the API status is `SCHEDULED`/`TIMED`.

c) **Add postponement handling logic**: When a game transitions to `postponed`:
   - Set `isPostponed = true` and `originalWeek = dbGame.week` on the game document
   - Find any existing picks for this `gameId`
   - Check if the gameweek has started (compare week against league's `current_game_week`)
   - If gameweek has started → set those picks' `result = "dnp"`
   - If gameweek has NOT started → delete those picks (users need to re-pick a different team)

d) **Handle un-postponement**: When a game transitions FROM `postponed` back to `not_started` (API sends `SCHEDULED`/`TIMED` again with a new date), keep `originalWeek` and `isPostponed = true` (the game is still a rescheduled match). The game's `week` field stays at the original value.

### 4. Exclude postponed games from week calculations

**File: `lib/game-updater.ts` (lines 323-405)**

- **`calculateCurrentGameWeek` (line 324)**: No change needed — `postponed` is neither `in_progress` nor `completed`, so it won't affect this query
- **`calculateCurrentPickWeek` (line 349)**: No change needed — since we change the status TO `"postponed"`, these games won't match `status: 'not_started'` anymore
- **`calculateLastCompletedWeek` (line 374)**: Exclude `postponed` games from the aggregation's initial `$match`: add `status: { $ne: 'postponed' }`. This way a postponed game in week 20 doesn't prevent week 20 from being "fully completed."

### 5. Update game status utilities

**File: `lib/game-utils.ts`**

- **`computeGameStatus` (line 20)**: Add early return for `"postponed"` — if `game.status === "postponed"`, return `"postponed"` (similar to how `"completed"` is trusted at line 34)
- **`canPickFromGame` (line 63)**: Already returns false for anything except `"not_started"` — no change needed
- **`getGameStatusDisplay` (line 70)**: Add case for `"postponed"` — label: "POSTPONED", className: yellow/amber styling
- **`isGameDisabled` (line 96)**: Add `"postponed"` to the disabled set

### 6. Update scoring to handle DNP

**File: `lib/scoring.ts`**

- **`updatePickResults` (line 35)**: When iterating picks with `result: null`, skip picks where the game's status is `"postponed"` (don't try to calculate a result). When a previously-postponed game completes (status `"completed"` with scores), also find picks with `result: "dnp"` for that game and recalculate their actual result.
- **`calculateScoresAndStrikes` (line 88)**:
  - At line 121, `result: { $ne: null }` already includes `"dnp"` picks — correct
  - At line 127, `weeksWithPicks` counts unique weeks — `"dnp"` picks will be counted, preventing false missing-pick strikes
  - At line 134-146, add `case "dnp": break` (0 points, 0 strikes) to the switch statement

### 7. Update pick creation to block postponed games

**File: `app/api/picks/route.ts`**

- When validating a pick, check if the game's status is `"postponed"` and reject with an appropriate error message

### 8. Update make-picks UI

**File: `app/make-picks/page.tsx`**

- Postponed games should render with a "POSTPONED" badge and be visually distinct (grayed out / amber border)
- They should not be selectable

### 9. Update game card styling

**File: `lib/game-utils.ts`**

- **`getGameCardClasses` (line 104)**: Handle `"postponed"` — use distinct styling (e.g., amber/yellow border with "POSTPONED" overlay)
- **`getTeamSelectionClasses` (line 142)**: Handle postponed games as disabled

## Files to Modify

| File | Changes |
|------|---------|
| `types/game.ts` | Add `"postponed"` to GameStatus, add `isPostponed`, `originalWeek` fields |
| `types/pick.ts` | Add `"draw"` and `"dnp"` to result union |
| `lib/game-updater.ts` | Fix status mapping (line 92), add postponement detection + pick handling in `updateGameInDatabase` (line 246), update `calculateLastCompletedWeek` (line 374) |
| `lib/game-utils.ts` | Handle `"postponed"` in `computeGameStatus`, `getGameStatusDisplay`, `isGameDisabled`, `getGameCardClasses`, `getTeamSelectionClasses` |
| `lib/scoring.ts` | Handle `"dnp"` in `updatePickResults` and `calculateScoresAndStrikes` |
| `app/api/picks/route.ts` | Block picks on postponed games |
| `app/make-picks/page.tsx` | Visual treatment for postponed games |

## Key Behavior Summary

| Scenario | What Happens |
|----------|-------------|
| Game postponed **before** gameweek starts | Game marked `postponed`, any existing picks deleted, game unpickable |
| Game postponed **after** gameweek starts | Game marked `postponed`, existing picks set to `result: "dnp"` |
| DNP pick during scoring | Counts as "having a pick" (no missing-pick strike), awards 0 points and 0 strikes |
| Postponed game eventually replayed and completed | `"dnp"` picks overwritten with actual result (`win`/`loss`/`draw`), scoring recalculates |
| API silently moves game date without `POSTPONED` status | Date-drift detection (>14 days from week median) catches it |

## Testing

Jest is already configured (`jest.config.js`) with `ts-jest`, `@/` path aliases, and MongoDB mocking patterns. Existing test suite at `lib/__tests__/scoring.test.ts` provides the pattern to follow.

### Test files to create/modify

**`lib/__tests__/game-updater.test.ts`** (new file) — following the mock pattern from `scoring.test.ts`:

1. **`mapApiStatusToInternal` tests** (requires exporting the function):
   - `POSTPONED` → `"postponed"`
   - `CANCELLED` → `"postponed"`
   - `SUSPENDED` → `"postponed"`
   - `FINISHED` → `"completed"` (unchanged)
   - `SCHEDULED` → `"not_started"` (unchanged)

2. **`calculateLastCompletedWeek` tests** (requires exporting or testing via `updateLeagueWeekTracking`):
   - Week with all games `completed` → returns that week
   - Week with one game `postponed` and rest `completed` → still returns that week (postponed excluded)
   - Week with one game `not_started` and rest `completed` → does NOT return that week

3. **Date-drift detection tests**:
   - Game date >14 days from week median → detected as postponed
   - Game date within 14 days → not flagged
   - Game already marked `postponed` → no duplicate detection

4. **Pick handling on postponement**:
   - Game postponed before gameweek starts → picks deleted
   - Game postponed after gameweek starts → picks set to `"dnp"`

**`lib/__tests__/scoring.test.ts`** (modify existing) — add tests for DNP handling:

1. **`updatePickResults` with postponed games**:
   - Pick with `result: null` on a `postponed` game → skipped (not updated)
   - Pick with `result: "dnp"` on a now-`completed` game → recalculated to actual result

2. **`calculateScoresAndStrikes` with DNP picks**:
   - Player with `"dnp"` pick → 0 points, 0 strikes from that pick
   - Player with `"dnp"` pick → counts as "having a pick" (no missing-pick strike)
   - Player with mix of `"win"`, `"dnp"`, `"loss"` picks → correct totals

**`lib/__tests__/game-utils.test.ts`** (new file) — pure function tests:

1. `computeGameStatus` with `status: "postponed"` → returns `"postponed"`
2. `canPickFromGame` with postponed game → returns `false`
3. `isGameDisabled` with postponed game → returns `true`
4. `getGameStatusDisplay("postponed")` → returns correct label/className

### Running tests

```bash
npm test                    # run all tests
npm test -- --watch         # watch mode
npm test -- scoring.test    # run specific test file
```

## Verification

1. **Week calculations unblocked**: Mark a game as `postponed` in the DB, run `updateLeagueWeekTracking()` — verify `lastCompletedWeek` advances past that week
2. **Pre-gameweek postponement**: Set a game to `postponed` before the gameweek starts — verify picks for that game are deleted and the game is unpickable
3. **Post-gameweek postponement (DNP)**: Create a pick on a game, start the gameweek, then mark the game `postponed` — verify pick gets `result: "dnp"`, no strike assessed, no points awarded
4. **Backfill on replay**: Complete the previously-postponed game with scores — verify the `"dnp"` pick gets overwritten with the actual result and scoring recalculates correctly
5. **Date-drift detection**: Change a game's `startTime` to 3 weeks later without changing API status — verify the system detects and flags it as postponed
6. **Missing-pick strikes**: Verify users who had a DNP pick are NOT charged a missing-pick strike for that week
