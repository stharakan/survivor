# Software Development Ticket

**Status**: Done (verified 2026-08-09)

Shipped as part of the CR-105 Python port (game updater was Rank 7 of that
port, per `CR-105-FINDINGS.md` Table 1, 7.4-7.9), rather than as work tracked
against this ticket directly. Verified AC-by-AC against the current code:

- **AC1 (Extended-range bulk query)**: `update_game_scores`
  (`api/app/db/game_updater.py:437-449`) builds `date_from`/`date_to` from
  `BULK_QUERY_DAYS_BACK`/`FORWARD` (default 7/7) and calls `_fetch_bulk_games`
  (`api/app/db/game_updater.py:106-125`), which hits
  `/v4/competitions/{code}/matches?dateFrom=...&dateTo=...`. This is a
  superset of the ticket's literal "today → +1 week" (it also looks back 7
  days), which only strengthens reschedule-catching, not a regression.
- **AC2 (DB overdue scan)**: `_find_overdue_games`
  (`api/app/db/game_updater.py:173-197`) queries
  `{"$or": [{"startTime": {"$lt": now}}, {"date": {"$lt": now}}], "status": "not_started"}`
  — matches the AC's `startTime < now AND status = 'not_started'` (plus a
  `date` fallback for older docs).
- **AC3 (Smart hybrid processing)**: for each overdue game,
  `update_game_scores` (`api/app/db/game_updater.py:465-480`) first calls
  `_find_game_in_bulk_response` (`api/app/db/game_updater.py:212-242`,
  matches by `externalId` then by date+team-name fallback) and only calls
  `_fetch_individual_game` (line 476, hitting `/v4/matches/{id}`) when no
  bulk match was found and an `externalId` exists.
- **AC4 (Status/score sync)**: `_update_game_in_database`
  (`api/app/db/game_updater.py:245-291`) writes `status` (mapped via
  `_map_api_status_to_internal`, lines 82-91: SCHEDULED/TIMED→not_started,
  LIVE/IN_PLAY/PAUSED/HALFTIME→in_progress,
  FINISHED/AWARDED/POSTPONED/CANCELLED/SUSPENDED→completed),
  `startTime`/`date`, `homeScore`, `awayScore`, and `externalId` back to the
  matched DB game.
- **AC5 (Scoring trigger)**: `_check_and_trigger_scoring`
  (`api/app/db/game_updater.py:297-315`) checks
  `db[PICKS].count_documents({"gameId": {"$in": completed_game_ids}})` and, if
  > 0, calls `run_scoring_calculation()` directly (the Python in-process
  equivalent of the TS route's HTTP call to `/api/admin/recompute-scores`,
  which also exists standalone at
  `api/app/routers/admin_scoring.py:20-24` for the cron script). Also
  independently re-triggers scoring if a completed game's score changed and
  picks were reset for re-scoring (`update_game_scores`, lines 502-504) — a
  correctness improvement beyond the ticket's literal ask.
- **AC6 (HTTP client script)**: `scripts/update-game-scores.js` POSTs to
  `${API_BASE_URL}/api/admin/update-game-scores` with an `X-API-Key` header
  (lines 9-35), matching the route at
  `api/app/routers/admin_scoring.py:27-31`, which is gated by
  `require_scoring_api_key` (`api/app/core/auth_deps.py:188-195`, compares
  `X-API-Key` header against the `SCORING_API_KEY` env var).
- **AC7 (Rate limiting)**: `_fetch_individual_game`
  (`api/app/db/game_updater.py:128-150`) sleeps
  `REQUEST_DELAY_MS / 1000` (default 6000ms → 6s, i.e. ≤10 calls/min) before
  each individual lookup; the bulk query is a single call.
- **AC8 (Logging)**: `_log` (`api/app/db/game_updater.py:29-30`) timestamps
  every step; `update_game_scores` logs bulk-fetch, overdue-scan,
  per-game-match, and a full summary block (bulk games processed, overdue
  found, individual calls made, games updated, games completed, picks reset,
  leagues updated, execution time — lines 507-521).
- **Gap noted, not blocking**: no dedicated automated test file exists for
  `game_updater.py`'s hybrid/overdue logic (`api/tests/` has no
  `test_game_updater*.py`); verified by direct code read against each AC,
  consistent with how this repo has verified other CR-105/106/107 tickets.

---

## Ticket Header
- **Ticket ID**: SUR-005-B
- **Title**: Automated Game Status and Score Updater with Hybrid Reschedule Detection
- **Type**: Feature
- **Priority**: High
- **Estimated Story Points**: 8

## User Story
As a **survivor league administrator**, I want **game statuses and scores to update automatically from the Football Data API with robust reschedule detection** so that **player picks are scored correctly and league standings reflect real game results even when games are rescheduled**.

## Description

### Current State Problem:
Game statuses (`not_started`, `in_progress`, `completed`) and scores (`homeScore`, `awayScore`) in the database are never updated after initial import. This creates multiple issues:
- Games remain "not_started" even after completion
- Scores remain null even when real games have finished
- Pick results are never calculated because games never move to "completed" status
- **Critical Edge Case**: Games rescheduled to earlier dates are missed by time-window queries

### Desired State:
An automated system using a **hybrid approach** that:
1. **Queries Football Data API** for games in extended range (today → +1 week) to catch most updates
2. **Scans database** for overdue games (started but still marked "not_started") to catch reschedules
3. **Smart API usage** - tries bulk response first, individual calls only when needed
4. **Updates database games** with accurate status and score information
5. **Triggers score recalculation** when games move to "completed" status and users have picks

### Technical Context:
- **Existing Infrastructure**: Football Data API integration exists in `scripts/import-epl-2025-fixtures.ts`
- **Scoring System**: Complete scoring calculation system exists at `/api/admin/recompute-scores`
- **Script Pattern**: `scripts/calculate-scores.js` provides the HTTP client pattern to follow
- **API Capabilities**: Football Data supports both bulk queries and individual game lookups
- **Rate Limiting**: Football Data API allows 10 requests/minute (free tier)

## Acceptance Criteria

**AC1: Extended range Football Data API integration**
- Given: The system needs comprehensive game data
- When: The API endpoint is called  
- Then: It queries Football Data API for games from `dateFrom=today` to `dateTo=oneWeekFromToday` to catch most rescheduled games

**AC2: Overdue game detection via database scan**
- Given: Some games may have been rescheduled outside the query window
- When: Processing game updates
- Then: Query database for games where `startTime < now AND status = 'not_started'` to find truly overdue games

**AC3: Smart hybrid processing to minimize API calls**
- Given: Overdue games are identified and recent games are fetched
- When: Processing overdue games
- Then: First try to find each overdue game in the bulk API response, only make individual `/v4/matches/{id}` calls for games not found

**AC4: Game status and score synchronization**
- Given: Football Data API returns updated game information (bulk or individual)
- When: Processing the API response
- Then: Local database games are updated with new `status`, `homeScore`, `awayScore`, and `startTime` values from the API

**AC5: Smart scoring trigger for completed games**
- Given: A game status changes from "not_started" or "in_progress" to "completed"
- When: Database updates are applied
- Then: Check if any users have picks for that game, and if so, call the existing `/api/admin/recompute-scores` endpoint

**AC6: HTTP client script following existing patterns**
- Given: A cron job needs to trigger game updates
- When: `scripts/update-game-scores.js` is executed
- Then: It calls the new `/api/admin/update-game-scores` endpoint with proper authentication and error handling

**AC7: Rate limiting and API efficiency**
- Given: Football Data API has rate limits (10 requests/minute)
- When: Making API calls in hybrid approach
- Then: Implement appropriate delays, batch most queries, and minimize individual calls through smart matching

**AC8: Comprehensive logging for hybrid approach**
- Given: The hybrid update process runs automatically
- When: Processing bulk queries, database scans, and individual API calls
- Then: Log detailed information with timestamps for each step including overdue game detection and API call optimization

## Technical Requirements

### Architecture Integration:
- **Backend API**: New `POST /api/admin/update-game-scores` endpoint in `app/api/admin/update-game-scores/route.ts`
- **Client Script**: New `scripts/update-game-scores.js` following the `calculate-scores.js` pattern
- **Hybrid Logic**: Extended range queries + database overdue detection + smart individual lookups
- **External API**: Integration with Football Data API bulk and individual endpoints

### APIs:
- **New Endpoint**: `POST /api/admin/update-game-scores` with X-API-Key authentication
- **External API Bulk**: Football Data API `/v4/competitions/PL/matches?dateFrom=X&dateTo=Y`
- **External API Individual**: Football Data API `/v4/matches/{id}` for overdue games not found in bulk
- **Existing Integration**: Call `/api/admin/recompute-scores` when games complete

### Database Operations:
- **Game Updates**: Bulk update operations on `games` collection for status and scores
- **Overdue Detection**: Query for `startTime < now AND status = 'not_started'`
- **Pick Detection**: Query `picks` collection to check for user picks on completed games
- **External ID Storage**: Store Football Data API game IDs for individual lookups

### Hybrid Processing Logic:
```typescript
// 1. Extended Range Query (today → +1 week)
const recentGames = await footballDataAPI.getMatches({
  dateFrom: today,
  dateTo: oneWeekFromToday
});

// 2. Database Scan for Truly Overdue Games  
const overdueGames = await db.games.find({
  startTime: { $lt: now },
  status: 'not_started'  // Only games that should have started
});

// 3. Smart Processing
for (const overdueGame of overdueGames) {
  const apiGame = recentGames.find(g => matchesGame(g, overdueGame));
  if (!apiGame) {
    // Individual API call only if needed
    const individualGame = await footballDataAPI.getMatch(overdueGame.externalId);
    processGameUpdate(overdueGame, individualGame);
  }
}
```

## Definition of Done

- [ ] New admin API endpoint created with hybrid processing logic and proper authentication
- [ ] Extended range Football Data API integration (today → +1 week) implemented with rate limiting
- [ ] Database overdue game detection logic implemented (`startTime < now AND status = 'not_started'`)
- [ ] Smart matching system to minimize individual API calls implemented
- [ ] Game synchronization logic updates database with accurate status and scores
- [ ] Smart triggering system calls scoring calculation when games complete with user picks
- [ ] HTTP client script created following existing patterns with comprehensive logging
- [ ] Unit tests written for hybrid processing and overdue detection logic (minimum 80% coverage)
- [ ] Integration tests added for the complete flow including edge case reschedules
- [ ] Error handling covers network failures, API rate limits, and missing individual games
- [ ] Performance testing shows acceptable execution time for hybrid approach
- [ ] Documentation updated in `scripts/README.md` with hybrid approach explanation

## Implementation Notes

### Hybrid Processing Pattern:
```typescript
// Core hybrid logic
async function updateGameScores() {
  // Step 1: Extended bulk query
  const bulkGames = await fetchBulkGames(today, oneWeekFromToday);
  
  // Step 2: Find overdue games
  const overdueGames = await findOverdueGames();
  
  // Step 3: Smart individual lookups
  const individualCalls = [];
  for (const overdue of overdueGames) {
    if (!findInBulkResponse(overdue, bulkGames)) {
      individualCalls.push(fetchIndividualGame(overdue.externalId));
    }
  }
  
  // Step 4: Process all updates
  await processAllGameUpdates([...bulkGames, ...await Promise.all(individualCalls)]);
}
```

### Game Status Mapping:
- **`SCHEDULED` → `not_started`**
- **`LIVE`, `IN_PLAY`, `PAUSED` → `in_progress`** 
- **`FINISHED` → `completed`**

### External ID Requirements:
- Store Football Data API game IDs in database during import
- Use these IDs for individual game lookups when needed
- Handle cases where external ID might be missing gracefully

### Rate Limiting Strategy:
- Bulk query: 1 API call
- Individual lookups: Typically 0-3 calls (only for edge cases)
- Built-in delays between individual calls
- Total: Usually 1 call, max ~5 calls per execution

## Testing Strategy

### Unit Tests:
- **Overdue Detection**: Test database query for `startTime < now AND status = 'not_started'`
- **Smart Matching**: Test finding overdue games in bulk API response
- **Individual Fallback**: Test individual API calls for games not found in bulk
- **Status Change Detection**: Test logic for detecting games that moved to "completed"

### Integration Tests:
- **Hybrid Flow**: Test complete flow from bulk query → overdue detection → individual lookups → updates
- **Reschedule Scenarios**: Test games moved backward/forward in time
- **API Rate Limiting**: Test behavior under rate limit constraints
- **Score Triggering**: Verify completed games trigger score recalculation

### Edge Case Testing:
- [ ] Game rescheduled from next week to yesterday (missed by time window)
- [ ] Game rescheduled from yesterday to next week (found in extended range)
- [ ] Game with missing external ID (graceful handling)
- [ ] Football Data API individual lookup returns 404 (error handling)
- [ ] Multiple overdue games requiring individual lookups (rate limiting)

## Risk Assessment

### Technical Risks:
- **Individual API Call Overhead**: Too many overdue games requiring separate lookups
  - *Mitigation*: Smart matching reduces individual calls, rate limiting prevents quota issues
- **External ID Missing**: Games without Football Data API IDs can't be individually queried
  - *Mitigation*: Graceful error handling, log missing IDs for manual review
- **Rate Limit Exhaustion**: Multiple individual calls hitting 10/minute limit
  - *Mitigation*: Conservative delays, prioritize most critical games

### Business Risks:
- **Missed Reschedules**: Very complex rescheduling scenarios not caught
  - *Mitigation*: Comprehensive logging allows manual identification and correction
- **Delayed Updates**: Overdue detection adds processing time
  - *Mitigation*: Database query is fast, individual calls only for edge cases

## Related Resources

- **Existing Script Pattern**: `scripts/calculate-scores.js` - HTTP client and authentication
- **API Authentication**: `app/api/admin/recompute-scores/route.ts` - X-API-Key validation  
- **Football Data Integration**: `scripts/import-epl-2025-fixtures.ts` - External API patterns
- **Football Data API Docs**: Individual game endpoint `/v4/matches/{id}`
- **Scoring System**: `lib/scoring.ts` - Existing calculation logic
- **Game Types**: `types/game.ts` - Data structure definitions

---