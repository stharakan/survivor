/**
 * SUR-008: plain Jest tests for the TS-only rendering helpers in
 * lib/game-utils.ts that have no Python counterpart / parity fixture --
 * getGameStatusDisplay, isGameDisabled, getGameCardClasses,
 * getTeamSelectionClasses. The 5 parity-relevant functions (computeGameStatus
 * and friends) are covered by the golden-fixture suite instead, see
 * game-utils-parity.test.ts.
 */
import {
  getGameStatusDisplay,
  isGameDisabled,
  getGameCardClasses,
  getTeamSelectionClasses,
} from '../game-utils'

describe('lib/game-utils.ts postponed handling (SUR-008)', () => {
  it('getGameStatusDisplay("postponed") returns a POSTPONED label with amber styling', () => {
    const display = getGameStatusDisplay('postponed')
    expect(display.label).toBe('POSTPONED')
    expect(display.className).toMatch(/amber/)
  })

  it('isGameDisabled returns true for a postponed game', () => {
    expect(isGameDisabled({ status: 'postponed' })).toBe(true)
  })

  it('isGameDisabled still returns false for a not_started game (regression check)', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    expect(isGameDisabled({ status: 'not_started', startTime: future })).toBe(false)
  })

  it('getGameCardClasses returns distinct amber/disabled styling for a postponed game', () => {
    const classes = getGameCardClasses({ status: 'postponed' })
    expect(classes).toMatch(/amber/)
    expect(classes).toMatch(/cursor-not-allowed/)
  })

  it('getTeamSelectionClasses treats a postponed game as disabled', () => {
    const classes = getTeamSelectionClasses({ status: 'postponed' }, false, false, false)
    expect(classes).toMatch(/cursor-not-allowed/)
  })
})
