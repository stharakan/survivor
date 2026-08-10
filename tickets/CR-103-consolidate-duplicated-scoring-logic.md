# CR-103: Consolidate Duplicated Scoring / Elimination Logic

**Ticket ID**: CR-103
**Title**: Consolidate Duplicated Scoring / Elimination Logic
**Type**: Tech Debt / Correctness
**Priority**: Medium
**Story Points**: 5
**Timeline**: 2-3 days
**Epic**: `tickets/COLLABORATION_READINESS_EPIC.md`, Phase 2 — Architecture Spike
(pulled into its own file 2026-08-10; previously an inline subsection only, no
standalone ticket existed for it). The epic doc now links here instead of
embedding this content.
**Status**: Unstarted. Originally blocked on CR-101 (backend-language decision);
**CR-101 is Done as of 2026-08-09** (`tickets/done/CR-101-FINDINGS.md`, go/no-go
DECIDED: GO on a Python/FastAPI backend), so this ticket is unblocked and, per its
own re-eval note below, should be consolidated **directly in Python** rather than
in TypeScript. Re-verified against the current codebase 2026-08-10 — the
duplication is still present, and SUR-008 (landed 2026-08-09/10) added a third
independently-encoded rule to both copies. See "Fresh evidence" below.

## Problem

Survivor scoring/elimination rules — win=3, draw=1, loss=1 strike, elimination at
2+ strikes — are implemented **independently, twice**, in `api/app/db/`:

1. **`api/app/db/scoring.py::calculate_scores_and_strikes`** (lines 92-155ish) —
   the scoring-of-record job, invoked from the score-update cron path
   (`app/db/game_updater.py` → `run_scoring_calculation`), writes
   `points`/`strikes`/`lossStrikes`/`missingPickStrikes` onto each
   `LeagueMembership` document.
2. **`api/app/db/results.py::get_season_summary`** (lines 121-249ish, per-week
   loop at 165-190) — a separate read-time recomputation of points/strikes,
   walked week-by-week to derive elimination data (`weekEliminated`,
   `pointsAtElimination`, `firstStrikeWeek`, `weeksBeforeFirstStrike`) for the
   season-summary/prizes page.

These are two independently-maintained encodings of the same rules with no shared
function and no shared test. They can silently drift: a future rule change (bonus
points, a different strike threshold, a new result value) landing in one and not
the other would make the scoreboard's `points`/`strikes` disagree with the season
summary's own recomputation for the exact same picks, and nothing in the test
suite would catch it — there is no single place to unit-test the rule.

This was flagged in the original epic write-up (as `lib/scoring.ts` vs.
`lib/db.ts::getSeasonSummary`, the pre-Python-port TypeScript equivalents) and was
**not fixed during the CR-105 migration — it was copied**, mirroring the original
TS-side split exactly, function names and all.

## Fresh evidence this is a live risk, not theoretical (SUR-008, 2026-08-09/10)

SUR-008 (postponed/rescheduled game handling) added a `"dnp"` pick result (0
points, 0 strikes, counts toward `weeks_with_picks` so it doesn't trigger a
missing-pick strike). That rule had to be hand-added to **both** copies
separately, since there was no shared function to add it to once:

`api/app/db/scoring.py:126-139`:
```python
for pick in picks:
    if pick["result"] == "win":
        total_points += 3
    elif pick["result"] == "draw":
        total_points += 1
    elif pick["result"] == "loss":
        loss_strikes += 1
    elif pick["result"] == "dnp":
        # SUR-008: a DNP pick (postponed game) is already counted
        # toward weeks_with_picks above -- no missing-pick strike --
        # but deliberately earns no points and no loss strike either.
        # Explicit no-op so "0 points, 0 strikes" reads as a stated
        # decision rather than an accident of the if/elif chain.
        pass
```

`api/app/db/results.py:165-186`:
```python
for week in range(1, last_completed_week + 1):
    pick = user_picks_by_week.get(week)

    if not pick:
        strikes += 1
        if first_strike_week is None:
            first_strike_week = week
    elif pick["result"] == "win":
        points += 3
    elif pick["result"] == "draw":
        points += 1
    elif pick["result"] == "loss":
        strikes += 1
        if first_strike_week is None:
            first_strike_week = week
    elif pick["result"] == "dnp":
        # SUR-008: a DNP pick (postponed game) is a real pick, so it
        # doesn't hit the `if not pick` missing-pick-strike branch
        # above, but it's explicitly worth 0 points and 0 strikes --
        # same "stated decision, not accidental" reasoning as
        # app/db/scoring.py's calculate_scores_and_strikes.
        pass
```

These two blocks are consistent with each other today only because the same
person added the same branch to both by hand in the same sitting, matching the
existing convention deliberately. Nothing in the codebase enforces that
consistency going forward — the next rule change (by a different contributor, in
either file alone) has no structural reason to touch both. **This ticket should
fold `"dnp"` into the shared function as a fourth first-class case**, not just the
original three (`win`/`draw`/`loss`) the epic text was written against before
SUR-008 existed.

## Acceptance Criteria

(Adapted from the epic's original 5 ACs: narrowed to Python-only per CR-101's
resolution and the ticket's own re-eval note — "if scoring moves to a Python
backend, consolidate it directly in Python" — and widened to cover `"dnp"`.)

- **AC1**: A single shared, pure function (e.g. `api/app/db/scoring_rules.py`, or
  similarly named — no standalone folder reorg) that computes per-week
  points/strikes/elimination state for one user, given their picks and
  `last_completed_week`. Must handle all four current `Pick.result` values —
  `"win"`, `"draw"`, `"loss"`, `"dnp"` — plus the missing-pick (no pick that week)
  case.
- **AC2**: `win=3`, `draw=1`, `dnp=0/0`, and the `strikes >= 2` elimination
  threshold expressed as named constants in one place, not repeated magic numbers.
- **AC3**: Unit tests for the shared function — pure computation, no DB needed
  (same pattern as `api/tests/test_game_utils_parity.py` /
  `test_game_updater_status_mapping.py`) — covering all 4 result values, the
  missing-pick case, and the elimination boundary (exactly 2 strikes).
- **AC4**: Both `scoring.py::calculate_scores_and_strikes` and
  `results.py::get_season_summary` call the shared function instead of encoding
  the rules inline. Existing behavior must be unchanged — SUR-008 already added
  live-Mongo coverage of `calculate_scores_and_strikes` including a DNP case
  (`api/tests/test_game_updater_live_mongo.py::test_calculate_scores_and_strikes_with_dnp_picks`);
  extend/reuse that rather than duplicating it, and add an equivalent live-Mongo
  case for `get_season_summary` if one doesn't already exist.
- **AC5**: The old inline duplicated blocks are removed entirely from both files
  (not left dead or commented out).

## Out of scope

- **`lib/scoring.ts` and `lib/db.ts::getSeasonSummary`** — the original TS-side
  duplicate this ticket was originally written against. Confirmed dead code:
  `app/api/*` was deleted wholesale in CR-106
  (`tickets/done/CR-106-frontend-static-export-cutover.md`), so nothing serves the
  old Next.js routes that called these anymore (same finding as SUR-008's
  Architecture Notes item 1 for the sibling `lib/game-updater.ts`). Not touched by
  this ticket.
- **Any rule changes** (bonus points, a different strike threshold, new result
  values beyond the current four) — this is pure extraction/consolidation of the
  *existing* rules, not a rules change.

## Files to Modify

| File | Change |
|------|--------|
| `api/app/db/scoring.py` | `calculate_scores_and_strikes`: replace the inline per-pick loop (lines 126-139 today) with a call to the shared function |
| `api/app/db/results.py` | `get_season_summary`: replace the inline per-week loop (lines 165-186 today) with a call to the shared function |
| New module, e.g. `api/app/db/scoring_rules.py` | The extracted shared function + named point/strike constants |
| New test file, e.g. `api/tests/test_scoring_rules.py` | Pure unit tests for the shared function, no DB needed |
| `api/tests/test_game_updater_live_mongo.py` | Extend/confirm `test_calculate_scores_and_strikes_with_dnp_picks` still passes unchanged after the refactor (regression check, not a new test) |

## Testing

1. Unit tests (new, no DB) for the shared function: `win`/`draw`/`loss`/`dnp`/
   missing-pick, and the exactly-2-strikes elimination boundary.
2. Regression: existing live-Mongo tests for both `calculate_scores_and_strikes`
   and `get_season_summary` (add one for the latter if none exists yet) must still
   pass unchanged after both call sites are switched to the shared function —
   this refactor must not change observable behavior.
3. Explicit before/after parity check: run both functions against the same seeded
   picks/league state before and after the refactor and diff the outputs, since
   the whole point is "these two must agree" — a manual or scripted check during
   review, not necessarily a permanent test.

## Verification

- `cd api && uv run pytest` — new unit tests pass, all existing tests (including
  the live-Mongo suite against a disposable `mongo:7` container, see
  `test_live_mongo_smoke.py`'s docstring for the invocation) still pass unchanged.
- Manually diff `calculate_scores_and_strikes`'s output against
  `get_season_summary`'s per-week recomputation for one league with a mix of
  win/draw/loss/dnp/missing weeks — they must agree exactly, which was not
  structurally guaranteed before this ticket.
