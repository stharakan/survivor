/**
 * Golden-fixture parity test for lib/game-utils.ts, required by
 * CR-105-FINDINGS.md Table 2 / Addendum 2 ("Validation elevated to a required
 * Phase 2 deliverable"). This is one half of the pair -- the other half is
 * api/tests/test_game_utils_parity.py, which loads the SAME fixture file
 * (../../test-fixtures/game-utils-golden.json) and must assert the same
 * booleans. This is the actual mechanism that keeps computeGameStatus /
 * canPickFromGame / canChangeExistingPick / hasGameweekStarted /
 * arePicksLocked in sync across the TS original and the new Python port --
 * not "keep them the same by eye".
 *
 * The fixture pins a `now` reference instant; jest fake timers freeze
 * `Date.now()` to that instant so lib/game-utils.ts's internal `new Date()`
 * calls are deterministic, without needing to touch the production source to
 * accept an injectable clock.
 */
import {
  computeGameStatus,
  canPickFromGame,
  canChangeExistingPick,
  hasGameweekStarted,
  arePicksLocked,
} from '../game-utils'
import fixtures from '../../test-fixtures/game-utils-golden.json'

describe('lib/game-utils.ts <-> Python parity (golden fixtures)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date(fixtures.now))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe.each(fixtures.gameStatusCases)('$name', (c) => {
    it(`computeGameStatus -> ${c.expectStatus}`, () => {
      expect(computeGameStatus(c.game as any)).toBe(c.expectStatus)
    })

    it(`canPickFromGame -> ${c.expectCanPick}`, () => {
      expect(canPickFromGame(c.game as any)).toBe(c.expectCanPick)
    })

    it(`canChangeExistingPick -> ${c.expectCanChange}`, () => {
      expect(canChangeExistingPick(c.game as any)).toBe(c.expectCanChange)
    })
  })

  describe.each(fixtures.gameweekStartedCases)('$name', (c) => {
    it(`hasGameweekStarted -> ${c.expect}`, () => {
      const targetWeek = c.targetWeek === null ? undefined : c.targetWeek
      expect(hasGameweekStarted(c.league as any, targetWeek)).toBe(c.expect)
    })
  })

  describe.each(fixtures.picksLockedCases)('$name', (c) => {
    it(`arePicksLocked -> ${c.expect}`, () => {
      expect(arePicksLocked(c.hasExistingPick, c.gameweekStarted)).toBe(c.expect)
    })
  })
})
