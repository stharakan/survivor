# SUR-007-A: Missing Pick Strike Calculation

**Ticket ID**: SUR-007-A
**Title**: Implement Missing Pick Strike Penalties in Scoring Calculation
**Type**: Feature Enhancement
**Priority**: High
**Estimated Story Points**: 5-8
**Related Tickets**: SUR-007-B (Player Stats Cache - depends on this ticket)

## User Story

As a league administrator and player, I want the system to automatically assign strikes for missed weekly picks, so that the game rules are enforced fairly and players cannot gain an advantage by failing to submit picks.

## Description

### Context and Background

The current system has a critical fairness issue: Players who fail to submit picks for completed weeks receive no penalty (no strike), creating an unfair advantage where missing a pick is better than making a losing pick. Both scenarios result in 0 points, but only the loss gives a strike.

This ticket addresses the scoring calculation logic to ensure fair rule enforcement.

### Current State vs. Desired State

**Current:**
- Strike calculation only considers picks that exist with `result: "loss"`
- No penalty for missing/unpicked weeks
- Players can strategically avoid picks to avoid strikes
- Only one `strikes` field in `league_memberships` collection

**Desired:**
- Automatic strike assignment: `strikes = loss_strikes + missing_pick_strikes`
- Missing picks calculated as: `(completed_weeks - picks_submitted_in_completed_weeks)`
- Separate tracking of strike types for transparency: `lossStrikes` and `missingPickStrikes`
- Fair enforcement: missing a pick = 1 strike, same penalty as a losing pick

### Dependencies

- Depends on existing `runScoringCalculation()` infrastructure (lib/scoring.ts)
- Integrates with game status update system (lib/game-updater.ts)
- Relies on league week tracking (`last_completed_week` field on leagues collection)
- Must maintain compatibility with existing `picks` and `league_memberships` collections

### Technical Considerations

- **Backward Compatibility**: Existing `strikes` field behavior maintained, new fields added
- **Update Frequency**: Calculation runs every 15 minutes via Cloud Scheduler → update-game-scores → runScoringCalculation
- **Retroactive Application**: Will apply to all historical missing picks when deployed
- **Source of Truth**: `picks` and `league_memberships` collections remain authoritative

## Acceptance Criteria

### AC1: Missing Pick Strike Calculation
**Given**: A league has completed week 10
**When**: A player has only submitted 7 picks (missing weeks 3, 5, and 9)
**Then**:
- Player receives 3 automatic strikes for missing picks
- `league_memberships.missingPickStrikes = 3`
- `league_memberships.lossStrikes` = count of picks with `result: "loss"`
- Total strikes = lossStrikes + missingPickStrikes
- Calculation logged with breakdown: `"X losses + Y missing picks = Z total strikes"`

### AC2: All Picks Present Scenario
**Given**: A league has completed 10 weeks
**When**: A player has submitted picks for all 10 weeks
**Then**:
- `missingPickStrikes = 0`
- `lossStrikes` = count of actual game losses
- Total strikes = lossStrikes only
- No missing week penalties applied

### AC3: Zero Completed Weeks Edge Case
**Given**: A league has 0 completed weeks (all games pending or in progress)
**When**: Scoring calculation runs
**Then**:
- All players have `missingPickStrikes = 0`
- No missing pick penalties applied
- Logic handles edge case without errors

### AC4: Partial Season Scenario
**Given**: A league is mid-season with 20 completed weeks
**When**: A new player joins and has only submitted 2 picks (weeks 19-20)
**Then**:
- `missingPickStrikes = 18` (missing weeks 1-18)
- Player accurately penalized for all missing historical weeks
- Note: This is expected behavior, but may need communication to new joiners

### AC5: Strike Type Tracking in Database
**Given**: Scoring calculation has run successfully
**When**: Querying `league_memberships` collection
**Then**:
- Each membership document has `lossStrikes: number` field
- Each membership document has `missingPickStrikes: number` field
- Original `strikes` field equals `lossStrikes + missingPickStrikes`
- All three fields are properly indexed and queryable

### AC6: Source of Truth Preservation
**Given**: Missing pick strikes are being calculated
**When**: Admin needs to investigate scoring discrepancies
**Then**:
- Original `picks` collection remains unchanged and queryable
- Original `league_memberships` collection maintains all current fields
- All strike calculations can be manually verified from source data
- Logging shows complete breakdown of strike calculation per player

## Technical Requirements

### Architecture

**Modified Components:**
- `lib/scoring.ts` - Add missing pick calculation to `calculateScoresAndStrikes()`
- `lib/scoring.ts` - Update strike tracking to separate loss vs missing
- `types/league.ts` - Add `lossStrikes` and `missingPickStrikes` to LeagueMembership type

**Function Signature Changes:**

```typescript
// In lib/scoring.ts
async function calculateScoresAndStrikes(
  db: Db,
  leagueId: ObjectId,
  lastCompletedWeek: number
): Promise<void> {
  // New logic:
  // 1. Fetch all league members
  // 2. For each member:
  //    a. Count picks with result="loss" → lossStrikes
  //    b. Count total picks in completed weeks → submittedPicks
  //    c. Calculate missingPickStrikes = lastCompletedWeek - submittedPicks
  //    d. Update membership with both strike types
  // 3. Log summary: "Player X: 2 loss strikes + 3 missing strikes = 5 total"
}
```

### Database Schema Changes

**Modified Collection: `league_memberships`**

```typescript
// In types/league.ts
export interface LeagueMembership {
  _id: ObjectId;
  leagueId: ObjectId;
  userId: ObjectId;
  teamName: string;
  status: 'active' | 'eliminated';
  points: number;
  strikes: number;              // EXISTING: Total strikes
  lossStrikes: number;          // NEW: Strikes from game losses
  missingPickStrikes: number;   // NEW: Strikes from missing picks
  joinedAt: Date;
  eliminatedAt?: Date;
}
```

**Migration Notes:**
- Existing documents will need backfill: calculate `lossStrikes` and `missingPickStrikes` from current data
- `strikes` field should equal `lossStrikes + missingPickStrikes` after migration
- Maintain backward compatibility: if new fields missing, default to 0

### Calculation Algorithm

**Pseudocode:**

```typescript
for each member in league:
  // Get loss strikes from picks
  lossStrikes = count(picks where result === "loss" and week <= lastCompletedWeek)

  // Get submitted picks count
  submittedPicks = count(picks where week <= lastCompletedWeek)

  // Calculate missing picks
  missingPickStrikes = lastCompletedWeek - submittedPicks

  // Ensure non-negative
  missingPickStrikes = max(0, missingPickStrikes)

  // Update database
  totalStrikes = lossStrikes + missingPickStrikes
  update league_membership set {
    lossStrikes,
    missingPickStrikes,
    strikes: totalStrikes
  }

  // Log for transparency
  log(`${teamName}: ${lossStrikes} losses + ${missingPickStrikes} missing = ${totalStrikes} total`)
```

### Testing Requirements

**Unit Tests (`lib/scoring.test.ts`):**

```typescript
describe('calculateScoresAndStrikes', () => {
  it('calculates missing pick strikes correctly', async () => {
    // Given: League with 10 completed weeks, player has 7 picks
    // When: Scoring calculation runs
    // Then: missingPickStrikes = 3
  })

  it('handles player with all picks submitted', async () => {
    // Given: Player has picks for all completed weeks
    // When: Scoring calculation runs
    // Then: missingPickStrikes = 0
  })

  it('handles zero completed weeks edge case', async () => {
    // Given: League with 0 completed weeks
    // When: Scoring calculation runs
    // Then: No errors, missingPickStrikes = 0 for all
  })

  it('separates loss strikes from missing strikes', async () => {
    // Given: Player has 5 picks (2 losses, 3 wins), 8 completed weeks
    // When: Scoring calculation runs
    // Then: lossStrikes = 2, missingPickStrikes = 3, strikes = 5
  })

  it('only counts picks in completed weeks', async () => {
    // Given: Player has picks for future weeks
    // When: Scoring calculation runs
    // Then: Future picks not counted in submitted total
  })
})
```

**Integration Tests:**

```typescript
describe('Full Scoring Calculation Flow', () => {
  it('assigns missing pick strike when week completes', async () => {
    // Given: Week 5 completes, player never submitted pick
    // When: Scoring runs
    // Then: Player receives 1 missing pick strike
  })

  it('updates strikes field as sum of loss and missing', async () => {
    // Given: Player has 2 loss strikes, 1 missing strike
    // When: Scoring runs
    // Then: strikes field = 3
  })

  it('logs strike breakdown for all players', async () => {
    // Given: Multiple players with various strike types
    // When: Scoring runs
    // Then: Log shows breakdown for each player
  })
})
```

## Implementation Notes

### Code Style and Patterns

Follow existing patterns in codebase:
- Use `logWithTimestamp()` for all logging (established pattern in lib/scoring.ts, lib/game-updater.ts)
- Error handling: try-catch with descriptive messages
- MongoDB queries: Use native driver (no ORM)
- Type safety: Full TypeScript types, no `any` types, use proper ObjectId conversion

### File Locations

**Modified Files:**
```
lib/scoring.ts                         # Add missing pick logic
types/league.ts                        # Add lossStrikes, missingPickStrikes fields
```

**New Test Files:**
```
lib/scoring.test.ts                    # Unit tests for scoring logic
```

### Naming Conventions

- Field names: camelCase (`lossStrikes`, `missingPickStrikes`)
- Function names: camelCase (`calculateScoresAndStrikes`)
- Type names: PascalCase (`LeagueMembership`)
- Log messages: Include player identifier and strike breakdown

### Logging Strategy

**Required Log Messages:**

```typescript
// At start of calculation
logWithTimestamp(`Calculating strikes for league ${leagueId}, ${lastCompletedWeek} completed weeks`)

// Per player (summary)
logWithTimestamp(`${teamName}: ${lossStrikes} loss strikes + ${missingPickStrikes} missing strikes = ${totalStrikes} total`)

// At end of calculation
logWithTimestamp(`Strike calculation complete. Updated ${memberCount} players.`)

// Error handling
logWithTimestamp(`ERROR calculating strikes for player ${userId}: ${error.message}`)
```

## Definition of Done

- [ ] Code implementation follows existing patterns in lib/scoring.ts
- [ ] Missing pick strike calculation implemented in `calculateScoresAndStrikes()`
- [ ] `lossStrikes` and `missingPickStrikes` fields added to LeagueMembership type
- [ ] Database updates correctly populate both new fields
- [ ] Total `strikes` field equals sum of `lossStrikes + missingPickStrikes`
- [ ] Unit tests written with coverage for edge cases
- [ ] Integration tests cover full scoring flow with missing picks
- [ ] Logging shows strike breakdown for each player
- [ ] Code reviewed and approved
- [ ] Documentation updated in code comments
- [ ] Tested on staging environment with sample data
- [ ] Verified retroactive application to historical data works correctly
- [ ] User communication prepared (announcement about new penalty rule)

## Risk Assessment

### Technical Risks

**Risk 1: Incorrect Missing Pick Logic**
- **Impact**: Players unfairly penalized or not penalized
- **Probability**: Low (logic is straightforward)
- **Mitigation**:
  - Extensive unit tests for edge cases
  - Manual verification on staging with test data
  - Detailed logging to allow verification
  - Gradual rollout with monitoring

**Risk 2: Performance Impact of Pick Counting**
- **Impact**: Slower scoring calculation runs
- **Probability**: Low (counting operations are fast)
- **Mitigation**:
  - Use efficient MongoDB aggregation if needed
  - Test with large datasets (100+ players)
  - Monitor scoring run duration after deployment

**Risk 3: Retroactive Strike Assignment**
- **Impact**: Existing players suddenly have more strikes
- **Probability**: High (expected behavior)
- **Mitigation**:
  - Not a bug, but requires user communication
  - See Business Risk 2 below

### Business Risks

**Risk 1: User Confusion About New Strikes**
- **Impact**: Players don't understand why strikes increased
- **Probability**: High (new rule enforcement)
- **Mitigation**:
  - Clear communication before deployment
  - Email/announcement about missing pick penalties
  - FAQ update explaining new rule
  - UI should show strike breakdown (handled in SUR-007-B)

**Risk 2: Historical Data Disputes**
- **Impact**: Players dispute retroactive strikes for old missing picks
- **Probability**: Medium
- **Mitigation**:
  - Announce change before deployment
  - Provide grace period or one-time strike forgiveness option
  - Admin tool to manually adjust strikes if needed
  - Clear documentation of rule change reasoning

**Risk 3: New Player Onboarding**
- **Impact**: New players joining mid-season receive many historical missing strikes
- **Probability**: High (expected behavior)
- **Mitigation**:
  - Document this as expected behavior
  - Consider policy: new joiners start from join week (policy decision, not in this ticket)
  - Clear onboarding messaging about strike rules

### Security Risks

No significant security risks identified. This is a backend calculation change with no user input or authentication concerns.

## Related Resources

### Related Tickets
- **SUR-007-B**: Player Stats Cache Implementation (depends on this ticket)
- **SUR-005-B**: Automated Game Updater (provides game completion trigger)
- **SUR-006**: Standardize ID Types (ensure consistent ObjectId handling)

### Technical Documentation
- Existing scoring logic: `lib/scoring.ts:88-161`
- Game update trigger: `lib/game-updater.ts:434-548`
- League week tracking: `lib/game-updater.ts:389-431`

### Code References
- `lib/scoring.ts` - Current strike calculation logic
- `types/league.ts` - LeagueMembership type definition
- `lib/game-updater.ts` - Automated scoring trigger

---

## Notes for Implementation

### Suggested Implementation Order

1. **Day 1: Schema and Types**
   - Add `lossStrikes` and `missingPickStrikes` to LeagueMembership type
   - Update TypeScript types throughout codebase

2. **Day 2-3: Core Logic**
   - Implement missing pick calculation in `calculateScoresAndStrikes()`
   - Add logging for strike breakdown
   - Test locally with sample data

3. **Day 4: Testing**
   - Write unit tests for edge cases
   - Write integration tests for full flow
   - Manual testing with various scenarios

4. **Day 5: Deployment**
   - Deploy to staging and verify
   - Run backfill to update existing memberships
   - Monitor logs for any issues
   - Deploy to production with monitoring

### Key Success Metrics

- **Fairness**: 100% of missing picks result in strikes
- **Transparency**: Logging shows strike breakdown for every player
- **Correctness**: Manual verification confirms accurate strike assignment
- **Performance**: Scoring calculation runtime does not increase significantly

### User Communication Template

**Subject**: Important Rule Update - Missing Pick Penalties

**Body**:
Starting [DATE], the Survivor League will enforce a missing pick penalty. Previously, if you did not submit a pick for a completed week, you received 0 points but no strike. This created an unfair advantage.

**New Rule**: Missing a pick = 1 strike (same as a losing pick)

**What This Means**:
- Your current strike count may increase to reflect past missing picks
- Going forward, make sure to submit picks every week to avoid penalties
- You can see your strike breakdown (loss strikes vs. missing strikes) on your profile

**Why This Change**:
This ensures fair play and prevents strategic non-picking to avoid strikes.

Questions? Contact [ADMIN EMAIL]
