# SUR-009: Postponed-Game Pick Window & Static Week Boundaries

**Ticket ID**: SUR-009
**Title**: Tie Postponed-Game Pickability and Missing-Pick Strikes to Real Week
Boundaries, Not Game Status
**Type**: Feature / Correctness (behavior change)
**Priority**: Medium — deferred by design, not urgent. Captured 2026-08-11 while
context was fresh, during SUR-008 implementation review; not scheduled for
immediate work. See "Why this is deferred" below.
**Depends on**: `tickets/SUR-008-postponed-game-handling.md` — this ticket
modifies behavior SUR-008 ships as an interim stopgap. Do not start this before
SUR-008 is merged; the diffs below are written against SUR-008's post-merge state.
**Status**: Not started. Written proactively during SUR-008 review (2026-08-11),
not yet scoped into story points — needs a proper sizing pass before pickup.

## Origin

Captured directly from a 2026-08-11 conversation reviewing SUR-008's date-drift
detection and pick-eligibility logic. Two things came up together and are
intentionally coupled in one ticket because they share the same missing
primitive — **a real, calendar-based notion of a week's boundaries** — rather
than because they're small:

1. The date-drift heuristic (SUR-008 step 3b) uses a floating median of
   sibling games' dates plus a fixed-radius threshold (originally 14 days,
   corrected to 4 days same day — see SUR-008's ticket). This works but is an
   approximation: it recomputes a different "center" every time it's asked and
   has no fixed sense of where one week ends and the next begins.
2. The desired end-state for postponed-game pickability and scoring, which
   SUR-008 does not implement (see "Desired end state" below) — and which
   turns out to need exactly the same missing primitive: a way to know
   definitively "has this pick week closed" independent of chasing individual
   games' `status` fields.

## Desired end state

Quoting the request directly, since this is a deliberate product decision, not
a bug report:

> a postponed game is pickable if and only if it is still that pick week. once
> the pick week is completed the postponed game should not be pickable, and it
> should appear that a user got a strike for that week.

Concretely:
- **While a postponed game's originally-assigned pick week is still open**: the
  game should remain pickable (or re-enterable), not unconditionally blocked
  the instant its status flips to `"postponed"`.
- **Once that pick week closes**: the postponed game becomes unpickable,
  period — no more picks or pick changes against it.
- **If the pick week closes without the game ever resolving**: any pick left
  sitting against it should be treated as a **real missing-pick strike**, not
  the permanently-neutral 0-points/0-strikes `"dnp"` treatment SUR-008 ships.

## Why this is deferred

Postponements are rare in the first half of a season. SUR-008's interim
behavior — postponed games are unconditionally unpickable the moment they're
flagged, and `"dnp"` picks are permanently neutral regardless of whether the
game ever resolves — is an accepted stopgap for that low-frequency window, not
a bug to rush-fix. This ticket exists so the gap is tracked and the design
questions below are answered deliberately when it's picked up, rather than
rediscovered from scratch or patched ad hoc under time pressure later in the
season when postponements become more likely to matter.

## What SUR-008 already provides (table stakes — not this ticket's job)

This ticket **modifies** the following SUR-008 behavior; it does not
re-implement it. A fresh agent should treat all of this as a correct, tested
foundation to build on:

- `"postponed"` game status, `isPostponed`/`originalWeek` fields (both
  languages).
- `"dnp"` pick result (both languages).
- `_map_api_status_to_internal` mapping `POSTPONED`/`CANCELLED`/`SUSPENDED` →
  `"postponed"` (not `"completed"`).
- `_handle_postponement`: deletes picks pre-gameweek, marks `"dnp"`
  post-gameweek.
- `_calculate_last_completed_week` excluding `"postponed"` games from its
  match.
- DNP backfill in `update_pick_results` when a postponed game is eventually
  replayed and completes.
- `compute_game_status`/`computeGameStatus` early-return for `"postponed"`,
  and `can_pick_from_game` correctly blocking postponed games (this is
  precisely the behavior item 1 below relaxes).
- The ±4-day median-based date-drift heuristic (`_is_date_drifted`,
  `_DATE_DRIFT_THRESHOLD`) — this ticket's item 3 below replaces the mechanism,
  not the underlying goal.

Do not re-derive or re-justify any of the above; SUR-008's own ticket file has
the full evidence trail if it's needed.

## Scope

### 1. Static week windows (the shared primitive)

Introduce a real `[weekStart, weekEnd]` boundary per `week` +
`sportsLeague` + `season`, computed and either stored or reliably derivable —
**open design question, resolve during implementation**: is this computed
once when a week's games are first known (e.g. at season/schedule creation)
and then fixed, or recomputed defensively on every `update_game_scores()` run
from whatever games currently claim that week? A fixed value is simpler and
matches "static" in this ticket's name; a recomputed value tolerates a week's
composition changing (e.g. a game added or moved out) but reintroduces some of
the floating-median fragility this ticket is trying to get away from. Pick one
and document why in the PR description — don't let it fall out implicitly.

This window becomes the basis for two currently-separate mechanisms:

- **Date-drift detection** (replacing `_is_date_drifted`'s median+radius
  heuristic): a game's new date is drifted if it falls outside its own week's
  static window (or inside a neighboring week's window) — more precise than a
  floating median that shifts as sibling games update, and stable under
  partial-week updates.
- **"Has this pick week closed"** as a calendar fact: today,
  `_calculate_current_pick_week`/`_calculate_last_completed_week` are entirely
  game-*status*-driven (do enough games in the week read as
  `"completed"`/`"not_started"`). Neither can currently answer "is it
  definitively too late to still be picking week N" independent of whether
  every game in week N has actually finished. This ticket needs that
  independent, calendar-based answer to drive items 2 and 3 below.

### 2. Relax postponed-game pick eligibility within an open window

`can_pick_from_game`/`canPickFromGame` (via `compute_game_status`) currently
treat `status == "postponed"` as an unconditional block, full stop. Change
this to: postponed games remain pickable as long as their (`originalWeek`)
pick week's static window is still open; only become unpickable once that
window closes.

This reopens a design question SUR-008 resolved one way and this ticket may
need to revisit: **should `_handle_postponement`'s pre-gameweek pick deletion
still fire immediately** when a game is first flagged postponed, given the
game might get rescheduled back inside the same still-open window before it
closes? Deleting immediately is simple but means a user who picked a game that
gets briefly flagged postponed-then-quickly-rescheduled loses their pick for
no real reason under the new model. Holding the pick instead (only clearing it
if the window closes without resolution) is more correct under the new
end-state but changes `_handle_postponement`'s contract. **Flag this
explicitly in the PR description either way — do not silently pick a
behavior**, same instruction SUR-008 gave for its own single-active-member
edge case (see `tickets/CR-103-consolidate-duplicated-scoring-logic.md` for
the pattern this project uses for that kind of call).

### 3. Convert unresolved DNP into a real missing-pick strike on window close

New logic (likely in `api/app/db/scoring.py`, adjacent to
`update_pick_results`'s existing DNP-backfill query) that, once a pick week's
static window has closed:
- Finds any pick still sitting at `"dnp"` (or any user with no valid pick at
  all against a game that never resolved) for that closed week.
- Reclassifies it as a genuine missing-pick strike — i.e. stops excluding it
  from strike assessment the way SUR-008's `calculate_scores_and_strikes`
  currently does (explicit `elif pick["result"] == "dnp": pass`, 0 pts/0
  strikes, counts toward `weeks_with_picks` so no missing-pick strike fires).
- This is a real behavior flip from SUR-008's shipped design — call it out
  explicitly in the PR description, same as SUR-008's own AC6 did for its
  `isLeagueEnded` behavior change (per CR-103's pattern), since it will change
  strike counts for any already-recorded DNP week once this lands.

### 4. Rules page

`app/rules/page.tsx:251-255`'s published text currently describes SUR-008's
interim rule ("marked DNP, backfilled when replayed"). Update it to describe
the window-based end state once items 1-3 land — players are reading this
page and it needs to stay accurate.

## Acceptance criteria (draft — refine during sizing)

- **AC1**: A static `[weekStart, weekEnd]` window is computed/derivable per
  week+sportsLeague+season, with the storage-vs-recompute question from item 1
  explicitly decided and documented.
- **AC2**: `_is_date_drifted` (or its replacement) uses the static window
  instead of a floating median+radius.
- **AC3**: A postponed game is pickable if and only if its pick week's static
  window is still open (`can_pick_from_game`/`canPickFromGame` updated, both
  languages, with a new parity fixture case).
- **AC4**: Once a pick week's window closes, postponed games in it become
  unconditionally unpickable, matching SUR-008's current (about-to-be-relaxed)
  behavior but now gated on window-close rather than status alone.
- **AC5**: A `"dnp"` pick (or missing pick) whose week's window has closed
  without resolution is scored as a real missing-pick strike, not neutral.
  Explicit test for the boundary: same week, window still open vs. window just
  closed, same unresolved game.
- **AC6**: `app/rules/page.tsx` updated to describe the new rule.
- **AC7**: The pre-gameweek pick-deletion-vs-hold question from item 2 is
  explicitly decided (not defaulted silently) and reflected in
  `_handle_postponement`'s behavior and its tests.

## Out of scope

- Anything already covered by SUR-008 (see "What SUR-008 already provides"
  above) — this ticket modifies specific behaviors, it doesn't re-litigate the
  whole feature.
- `lib/game-updater.ts`/`lib/scoring.ts` — still dead code in production per
  SUR-008's own Architecture Notes; that determination doesn't change here.

## Testing

Follow the same two-suite pattern SUR-008 established: pure-function
parametrized `pytest`/Jest tests for the window-boundary math and the
relaxed/tightened pick-eligibility functions, plus a live-Mongo suite (extend
`api/tests/test_game_updater_live_mongo.py` or add a sibling file) for the
window-close-triggered strike conversion, since that needs real DB state
(a pick, a game, and a week-boundary check together) to exercise meaningfully.
