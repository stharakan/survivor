# SUR-007-B: Player Stats Cache Implementation

**Ticket ID**: SUR-007-B
**Title**: Implement Player Stats Cache for Performance Optimization
**Type**: Performance Enhancement / Infrastructure
**Priority**: High
**Estimated Story Points**: 8-13
**Related Tickets**: SUR-007-A (Missing Pick Strikes - required dependency)

## User Story

As a league administrator and player, I want fast-loading scoreboard, results, and profile pages, so that I can quickly view standings and pick history even as league participation grows to 50+ players.

## Description

### Context and Background

Currently, three heavily-used pages (Scoreboard, Results, Profile) perform expensive database operations with multiple collection joins and aggregations on every page load. This creates performance bottlenecks as leagues grow.

This ticket implements a materialized view pattern using a `player_stats_cache` collection to pre-compute player statistics and pick history, dramatically reducing page load times.

### Current State vs. Desired State

**Current:**
- Every scoreboard/results/profile page load triggers complex multi-collection aggregations
- Scoreboard: joins `league_memberships` + `users` + `picks` + computed rankings
- Results: joins `league_memberships` + `users` + `picks` + `teams` for full matrix
- Profile: similar joins for individual player view
- Data fetching logic duplicated across three different API endpoints
- Rankings computed on-demand during page requests
- Page load times: 1-2 seconds for large leagues

**Desired:**
- Unified materialized view (`player_stats_cache`) updated once during score calculation
- All three pages read from same cached collection with simple queries
- Single MongoDB query per page (no joins required)
- Pre-computed rankings stored in cache
- Cache invalidation only during automated scoring runs (every 15 minutes)
- Page load times: < 200ms (scoreboard), < 500ms (results), < 100ms (profile)

### Dependencies

- **CRITICAL**: Depends on SUR-007-A being completed first (requires `lossStrikes` and `missingPickStrikes` fields)
- Integrates with `runScoringCalculation()` infrastructure (lib/scoring.ts)
- Relies on game status update system (lib/game-updater.ts)
- Must maintain compatibility with existing `picks` and `league_memberships` collections (source of truth)

### Technical Considerations

- **Data Duplication Strategy**: Cache is derived/materialized data, source collections remain authoritative
- **Update Frequency**: Cache updated every 15 minutes via Cloud Scheduler → update-game-scores → runScoringCalculation
- **Document Size**: ~9 KB per player (38 weeks × 200 bytes/pick + metadata), well within MongoDB 16MB limit
- **Backward Compatibility**: Existing collections unchanged, cache added alongside
- **Rollback Safety**: Can disable cache reads and fall back to live queries without data loss

## Acceptance Criteria

### AC1: Player Stats Cache Creation and Population
**Given**: The scoring calculation runs after games complete
**When**: `runScoringCalculation()` updates source data (via SUR-007-A)
**Then**:
- New `player_stats_cache` collection is created (if not exists)
- One document per active player per league is inserted/updated
- Each document contains: user info, stats summary, complete pick history, missing weeks array
- Cache includes pre-computed rank based on points (desc), strikes (asc)
- `lastUpdated` timestamp reflects current calculation time
- Cache includes both `lossStrikes` and `missingPickStrikes` from SUR-007-A

### AC2: Scoreboard Page Performance Improvement
**Given**: A league with 50+ active players
**When**: User loads the scoreboard page
**Then**:
- Single MongoDB query to `player_stats_cache` collection (no joins)
- Query uses index on `{ leagueId: 1, rank: 1 }`
- Response time < 200ms (vs current ~1-2s for large leagues)
- Displays: rank, teamName, userName, points, strikes
- Strike breakdown available: "X total (Y losses, Z missing)"

### AC3: Results Page Matrix Display
**Given**: A league with completed weeks and various pick statuses
**When**: User loads the results page
**Then**:
- Single query fetches all players' pick arrays from cache
- Missing picks displayed with distinct styling (can identify from `missingWeeks` array)
- Completed picks show team name with color-coded result
- Matrix renders all players × all completed weeks efficiently
- Page load time < 500ms even for full season (38 weeks)

### AC4: Profile Page Detailed View
**Given**: Viewing any player's profile page
**When**: Page loads player data
**Then**:
- Single document lookup by `{ leagueId, userId }` from cache
- Displays summary stats: points, strikes, rank, strike breakdown
- Shows complete pick history with team logos, dates, results
- Highlights missing weeks using `missingWeeks` array
- Lists specific missing weeks: "Week 3, Week 5, Week 9"

### AC5: Source of Truth Preservation
**Given**: The cache has been populated
**When**: Admin needs to correct a pick result or investigate data
**Then**:
- Original `picks` collection remains unchanged and queryable
- Original `league_memberships` collection maintains all current fields
- Cache can be rebuilt from source data at any time via backfill script
- Admin tools query source collections, not cache
- Source collections remain the single source of truth

### AC6: Cache Staleness Handling
**Given**: A cache update fails due to database connection issue
**When**: System detects cache update failure
**Then**:
- Error is logged with details of failure point
- Source collections remain updated (picks, memberships)
- Frontend displays stale data with `lastUpdated` timestamp visible
- Next successful scoring run brings cache back in sync
- Optional: Fallback to live query if cache age > 30 minutes

### AC7: Rank Calculation with Tie Handling
**Given**: Multiple players have identical points and strikes
**When**: Cache rank recalculation runs
**Then**:
- Players with same points/strikes receive same rank number
- Next rank skips appropriately (e.g., two players tied at rank 3, next is rank 5)
- Sort order: points DESC, strikes ASC, teamName ASC (for consistent ordering)
- Rank updates atomic per league to avoid inconsistent intermediate states

### AC8: Cache Rebuild Capability
**Given**: Cache data becomes corrupted or needs regeneration
**When**: Admin runs backfill script or calls rebuild endpoint
**Then**:
- Cache is completely regenerated from source collections
- All player documents rebuilt with current data
- Rankings recalculated correctly
- Process completes without errors
- Logs show progress and completion status

## Technical Requirements

### Architecture

**New Components:**
- `lib/player-stats-cache.ts` - Cache management module with update/rebuild logic
- `types/player-stats-cache.ts` - TypeScript type definitions for cache documents
- `scripts/backfill-player-stats-cache.ts` - Migration/rebuild script

**Modified Components:**
- `lib/scoring.ts` - Call cache update in `runScoringCalculation()`
- `lib/mongodb.ts` - Add `PLAYER_STATS_CACHE` to Collections enum
- `app/api/scoreboard/route.ts` - Query cache instead of live data
- `app/api/leagues/[leagueId]/results/route.ts` - Query cache for results matrix
- `lib/api.ts` or `lib/db.ts` - Update `getPlayerProfile()` to read from cache

### Database Schema

**New Collection: `player_stats_cache`**

```typescript
// In types/player-stats-cache.ts
export interface PlayerStatsCache {
  _id: ObjectId;
  leagueId: ObjectId;           // Reference to league
  userId: ObjectId;             // Reference to user

  // User/Member Info
  userName: string;             // User display name
  teamName: string;             // Fantasy team name
  status: 'active' | 'eliminated';

  // Aggregate Stats (for scoreboard)
  points: number;               // Total points earned
  strikes: number;              // Total strikes (losses + missing)
  lossStrikes: number;          // Strikes from game losses (from SUR-007-A)
  missingPickStrikes: number;   // Strikes from missing picks (from SUR-007-A)
  rank: number;                 // Pre-computed rank in league

  // Weekly Pick History (for results & profile)
  picks: CachedPickData[];

  // Missing Week Tracking
  missingWeeks: number[];       // Array of week numbers with no pick

  // Metadata
  lastUpdated: Date;            // Last cache update timestamp
  lastCompletedWeek: number;    // League's last completed week at update time
}

export interface CachedPickData {
  week: number;                 // Week number
  teamId: number;               // Picked team ID
  teamName: string;             // Team name (denormalized)
  teamLogo: string;             // Team logo URL
  gameId: number;               // Associated game ID
  gameDate: Date;               // Game date/time
  result: 'win' | 'loss' | 'draw' | null;  // Game result
}
```

**Indexes:**

```javascript
// For scoreboard queries (sorted by rank)
db.player_stats_cache.createIndex({ leagueId: 1, rank: 1 })

// For profile lookups (single user)
db.player_stats_cache.createIndex({ leagueId: 1, userId: 1 }, { unique: true })

// For cache staleness monitoring
db.player_stats_cache.createIndex({ lastUpdated: 1 })
```

### API Changes

**No Breaking Changes** - Existing APIs continue to work, just read from different source:

**Modified Endpoints:**
- `GET /api/leagues/[leagueId]/scoreboard` → Queries `player_stats_cache` with rank projection
- `GET /api/leagues/[leagueId]/results` → Queries `player_stats_cache` with picks projection
- `GET /api/player/[userId]/profile?leagueId=X` → Queries `player_stats_cache` for single user

**New Admin Endpoint:**
- `POST /api/admin/rebuild-player-cache` → Manually rebuild cache from source data
  - Requires admin authentication
  - Optional query parameter: `leagueId` to rebuild specific league only
  - Returns: status, rebuild count, errors (if any)

### Core Functions in `lib/player-stats-cache.ts`

```typescript
/**
 * Update player stats cache for all leagues with recent game updates
 * Called from runScoringCalculation() after scores are updated
 */
export async function updatePlayerStatsCache(
  db: Db,
  affectedLeagueIds: ObjectId[]
): Promise<void>

/**
 * Rebuild cache for a specific league from source data
 * Used for backfills and manual corrections
 */
export async function rebuildLeagueCache(
  db: Db,
  leagueId: ObjectId
): Promise<number>

/**
 * Recalculate and update ranks for all players in a league
 * Handles ties correctly (same rank for same scores)
 */
export async function recalculatePlayerRanks(
  db: Db,
  leagueId: ObjectId
): Promise<void>

/**
 * Build cache document for a single player
 * Aggregates data from memberships, picks, users, teams
 */
async function buildPlayerCacheDocument(
  db: Db,
  leagueId: ObjectId,
  userId: ObjectId,
  lastCompletedWeek: number
): Promise<PlayerStatsCache>
```

### Testing Requirements

**Unit Tests (`lib/player-stats-cache.test.ts`):**

```typescript
describe('updatePlayerStatsCache', () => {
  it('creates cache documents for all league players', async () => {
    // Given: League with 10 players, source data updated
    // When: Cache update runs
    // Then: 10 documents created in player_stats_cache
  })

  it('enriches picks with team and game data', async () => {
    // Given: Picks exist with teamId and gameId
    // When: Cache update runs
    // Then: Cached picks include teamName, teamLogo, gameDate
  })

  it('identifies missing weeks correctly', async () => {
    // Given: Player missing weeks 3, 5, 9 out of 10 completed
    // When: Cache update runs
    // Then: missingWeeks = [3, 5, 9]
  })

  it('handles players with no picks', async () => {
    // Given: Player joined but never submitted picks
    // When: Cache update runs
    // Then: picks = [], missingWeeks = [1..lastCompletedWeek]
  })
})

describe('recalculatePlayerRanks', () => {
  it('handles tie scenarios correctly', async () => {
    // Given: Two players with 12 points, 2 strikes
    // When: Rank calculation runs
    // Then: Both receive rank 1, next player is rank 3
  })

  it('sorts by points desc, strikes asc', async () => {
    // Given: Players with varying points/strikes
    // When: Ranks calculated
    // Then: Higher points ranks higher, fewer strikes ranks higher
  })

  it('uses teamName as tiebreaker for consistent ordering', async () => {
    // Given: Two players with identical points/strikes
    // When: Ranks calculated
    // Then: Same rank, but consistent sort order by teamName
  })
})

describe('rebuildLeagueCache', () => {
  it('rebuilds cache from source data', async () => {
    // Given: Corrupted cache data
    // When: Rebuild runs
    // Then: All documents regenerated accurately from source
  })

  it('returns count of rebuilt documents', async () => {
    // Given: League with 15 players
    // When: Rebuild runs
    // Then: Returns 15
  })
})
```

**Integration Tests:**

```typescript
describe('Full Cache Update Flow', () => {
  it('updates cache after game completion', async () => {
    // Given: Game completes, triggering score calculation
    // When: runScoringCalculation() executes
    // Then: Source data updated, cache updated, lastUpdated timestamp current
  })

  it('pages reflect cached data immediately', async () => {
    // Given: Cache has been updated
    // When: Scoreboard, Results, Profile pages load
    // Then: All show data from cache, not source
  })
})
```

**Performance Tests:**

```bash
# Benchmark cache query vs live query
node scripts/benchmark-cache-performance.js

# Load test scoreboard endpoint
ab -n 1000 -c 10 http://localhost:3000/api/leagues/XXX/scoreboard

# Measure cache update duration
# Should complete in < 5 seconds for 100 players
```

## Implementation Notes

### Code Style and Patterns

Follow existing patterns in codebase:
- Use `logWithTimestamp()` for all logging (established pattern in lib/scoring.ts, lib/game-updater.ts)
- Error handling: try-catch with descriptive messages, log-and-continue for batch operations
- MongoDB queries: Use native driver (no ORM), aggregation pipelines for complex joins
- Type safety: Full TypeScript types, no `any` types, use proper ObjectId conversion
- Bulk operations: Use `bulkWrite()` for efficient cache updates

### File Locations

**New Files:**
```
lib/player-stats-cache.ts              # Cache management logic
types/player-stats-cache.ts            # Type definitions
scripts/backfill-player-stats-cache.ts # Migration/rebuild script
```

**Modified Files:**
```
lib/scoring.ts                         # Add cache update call
lib/mongodb.ts                         # Add PLAYER_STATS_CACHE constant
app/api/scoreboard/route.ts           # Query cache instead of live data
app/api/leagues/[leagueId]/results/route.ts  # Query cache
lib/api.ts or lib/db.ts                # Update getPlayerProfile()
```

### Naming Conventions

- Collection name: `player_stats_cache` (snake_case, consistent with existing)
- Function names: camelCase (`updatePlayerStatsCache`, `recalculatePlayerRanks`)
- Type names: PascalCase (`PlayerStatsCache`, `CachedPickData`)
- Constants: UPPER_SNAKE_CASE for collection names in Collections enum

### Migration Strategy

**Phase 1: Add Cache Infrastructure (Non-Breaking)**
1. Add `PLAYER_STATS_CACHE` to Collections
2. Create `lib/player-stats-cache.ts` with update logic
3. Modify `runScoringCalculation()` to call cache update
4. Deploy - cache starts populating on next scoring run
5. No frontend changes yet

**Phase 2: Update Read Paths (Feature Flag)**
6. Add environment variable `USE_PLAYER_STATS_CACHE=true|false` (default: false)
7. Update API routes to check flag: if true, read cache; else, read source
8. Deploy and enable flag in staging
9. Monitor performance and accuracy

**Phase 3: Full Cutover**
10. Set `USE_PLAYER_STATS_CACHE=true` in production
11. Monitor for 1 week with detailed logging
12. Verify cache accuracy against source data samples

**Phase 4: Cleanup**
13. Remove feature flag and legacy query code
14. Archive old query implementations as comments (for reference)
15. Add cache monitoring/alerting

### Rollback Plan

If issues arise:
1. Set `USE_PLAYER_STATS_CACHE=false` (instant rollback to live queries)
2. Investigate cache data discrepancies
3. Run backfill script to rebuild cache from source
4. Re-enable cache after verification
5. No data loss risk (source collections unaffected)

### Backfill Script Usage

```bash
# Rebuild cache for all leagues
npx tsx --env-file=.env.local scripts/backfill-player-stats-cache.ts

# Rebuild cache for specific league
npx tsx --env-file=.env.local scripts/backfill-player-stats-cache.ts --league-id=507f1f77bcf86cd799439011

# Dry run (show what would be done)
npx tsx --env-file=.env.local scripts/backfill-player-stats-cache.ts --dry-run
```

## Definition of Done

- [ ] Code implementation follows existing patterns in lib/scoring.ts and lib/game-updater.ts
- [ ] New collection `player_stats_cache` created with proper indexes
- [ ] Cache update integrated into `runScoringCalculation()` workflow
- [ ] All three pages (scoreboard, results, profile) read from cache
- [ ] Feature flag implemented for gradual rollout
- [ ] Unit tests written with >80% coverage for new functions
- [ ] Integration tests cover full scoring → cache → display flow
- [ ] Performance benchmarks met: scoreboard < 200ms, results < 500ms, profile < 100ms
- [ ] Code reviewed and approved by technical lead
- [ ] Database migration tested on staging environment
- [ ] Backfill script successfully rebuilds cache from production data
- [ ] Monitoring added for cache staleness (lastUpdated tracking)
- [ ] Documentation updated: README, API docs, architecture notes
- [ ] Admin rebuild endpoint implemented and tested
- [ ] Rollback procedure documented and tested
- [ ] Production deployment completed with feature flag
- [ ] Post-deployment monitoring confirms performance improvement
- [ ] Cache accuracy verified against source data

## Risk Assessment

### Technical Risks

**Risk 1: Cache-Source Data Drift**
- **Impact**: Users see incorrect scores/strikes
- **Probability**: Medium (if update fails silently)
- **Mitigation**:
  - Comprehensive error logging in cache update
  - Add cache validation checks (compare sample to source)
  - Monitor cache `lastUpdated` timestamps for staleness
  - Feature flag allows instant rollback

**Risk 2: MongoDB Document Size Limit**
- **Impact**: Cache updates fail for players with extensive history
- **Probability**: Low (9KB << 16MB limit)
- **Mitigation**:
  - Monitor document sizes in production
  - Future: Split picks into separate collection if needed
  - Alert if document size > 1MB (way before limit)

**Risk 3: Performance Degradation During Update**
- **Impact**: Slow response times during 15-minute update window
- **Probability**: Low (updates are background process)
- **Mitigation**:
  - Use bulk write operations for efficiency
  - Update cache asynchronously (don't block API responses)
  - Test with large datasets (100+ players)

**Risk 4: Index Performance**
- **Impact**: Cache queries slower than expected
- **Probability**: Low (proper indexes in place)
- **Mitigation**:
  - Performance test all query patterns before deployment
  - Monitor query execution times in production
  - Use MongoDB explain() to verify index usage

### Business Risks

**Risk 1: Cache Shows Stale Data**
- **Impact**: Users see outdated scores during cache update failures
- **Probability**: Low (robust error handling)
- **Mitigation**:
  - Display `lastUpdated` timestamp on pages
  - Alert if cache age > 30 minutes
  - Automatic fallback to live query for very stale cache
  - Clear user communication: "Last updated X minutes ago"

**Risk 2: Migration Complexity**
- **Impact**: Extended downtime during initial cache population
- **Probability**: Low (can populate in background)
- **Mitigation**:
  - Populate cache before switching reads to it
  - Feature flag allows gradual rollout
  - Test migration on staging with production-sized data
  - Zero-downtime deployment strategy

### Security Risks

**Risk 1: Cache Poisoning**
- **Impact**: Malicious data injected into cache
- **Probability**: Low (internal system, no direct user input)
- **Mitigation**:
  - Cache only updated via authenticated admin endpoints
  - Validate all data during cache population
  - Source collections remain authoritative
  - Admin rebuild endpoint requires authentication

**Risk 2: Performance-Based DoS**
- **Impact**: Repeated cache rebuilds triggered maliciously
- **Probability**: Low (admin-only endpoints)
- **Mitigation**:
  - Rate limit admin rebuild endpoint
  - Require API key authentication
  - Monitor for unusual rebuild requests
  - Log all manual rebuild invocations

## Related Resources

### Related Tickets
- **SUR-007-A**: Missing Pick Strike Calculation (required dependency)
- **SUR-005-B**: Automated Game Updater (provides game completion trigger)
- **SUR-006**: Standardize ID Types (ensure consistent ObjectId handling)

### Technical Documentation
- MongoDB Aggregation Pipelines: https://www.mongodb.com/docs/manual/aggregation/
- Materialized Views Pattern: https://www.mongodb.com/blog/post/materialized-views-with-mongodb
- Next.js API Routes: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- MongoDB Bulk Write Operations: https://www.mongodb.com/docs/manual/reference/method/db.collection.bulkWrite/

### Architecture Decisions
- Decision to use materialized view instead of real-time aggregations (performance)
- Decision to maintain source collections as single source of truth (data integrity)
- Decision to use feature flag for gradual rollout (risk mitigation)

### Design References
- Current scoreboard UI: `/app/scoreboard/page.tsx`
- Current results matrix: `/app/results/page.tsx`
- Current profile layout: `/app/player/[id]/page.tsx`

### Code References
- Existing scoring logic: `lib/scoring.ts:88-161`
- Game update trigger: `lib/game-updater.ts:434-548`
- League week tracking: `lib/game-updater.ts:389-431`

---

## Notes for Implementation

### Suggested Implementation Order

1. **Day 1-2: Infrastructure Setup**
   - Add `PLAYER_STATS_CACHE` to Collections enum
   - Create TypeScript types in `types/player-stats-cache.ts`
   - Create MongoDB indexes
   - Set up feature flag environment variable

2. **Day 3-5: Cache Update Logic**
   - Implement `lib/player-stats-cache.ts` core functions
   - Write `buildPlayerCacheDocument()` with all data enrichment
   - Write `recalculatePlayerRanks()` with tie handling
   - Unit tests for cache functions

3. **Day 6-7: Integration with Scoring**
   - Add cache update call in `runScoringCalculation()`
   - Handle errors gracefully (cache failure shouldn't break scoring)
   - Test locally with sample data
   - Verify cache updates after scoring runs

4. **Day 8-9: API Route Updates**
   - Update scoreboard API to read from cache (with feature flag)
   - Update results API to read from cache (with feature flag)
   - Update profile API to read from cache (with feature flag)
   - Maintain fallback to live queries when flag is off

5. **Day 10: Backfill Script**
   - Create `scripts/backfill-player-stats-cache.ts`
   - Test with staging data
   - Add dry-run mode for safety
   - Document usage

6. **Day 11: Admin Tools**
   - Create admin rebuild endpoint
   - Add authentication and rate limiting
   - Test manual rebuild flow

7. **Day 12-13: Testing and Deployment**
   - Performance benchmarking
   - Integration tests for full flow
   - Staging deployment with cache population
   - Enable feature flag in staging
   - Production deployment (cache off initially)
   - Populate production cache via backfill
   - Enable feature flag in production
   - Monitor for 1 week

### Key Success Metrics

- **Performance**: Scoreboard load time reduced by >70% (2s → <200ms)
- **Scalability**: System handles 200+ player leagues efficiently
- **Reliability**: Cache staleness < 20 minutes 99.9% of time
- **Accuracy**: Cache data matches source data with 100% accuracy
- **Availability**: Zero downtime during migration

### Monitoring and Alerts

**Add Monitoring For:**
- Cache update duration (alert if > 10 seconds)
- Cache age per league (alert if > 30 minutes)
- Cache update failures (immediate alert)
- Query performance on cache collection (alert if > 500ms p95)
- Cache document size growth (alert if approaching limits)

**Dashboard Metrics:**
- Average cache age across all leagues
- Cache hit rate (reads from cache vs fallback to source)
- Cache update frequency and success rate
- Page load times (before/after cache implementation)
