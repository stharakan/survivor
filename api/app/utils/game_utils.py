"""Port of lib/game-utils.ts's server-side-consumed half (CR-105-FINDINGS.md
Table 2 -- the "duplicate list" file). Only the 5 functions Table 2 names as
having a real server-side consumer are ported: `computeGameStatus`,
`canPickFromGame`, `canChangeExistingPick`, `hasGameweekStarted`,
`arePicksLocked`. The other 6 exports (`getGameStatusDisplay`, `isGameDisabled`,
`getGameCardClasses`, `getTeamSelectionClasses`, `canMakeFirstPick`,
`shouldDisablePickChanges`) are pure UI rendering helpers with zero
`app/api/*` importers per Table 2 -- correctly TS-only, not ported here.

**This is one half of a required pair** (CR-105-FINDINGS.md Addendum 2,
"Validation elevated to a required Phase 2 deliverable"): a golden-fixture
parity test asserts these functions and their TS originals produce identical
booleans for the same inputs. The fixtures live in
`../../../test-fixtures/game-utils-golden.json` (repo-root-relative); the two
test suites are `lib/__tests__/game-utils-parity.test.ts` (TS) and
`api/tests/test_game_utils_parity.py` (this module). If you change the
pick-lock rules here, update lib/game-utils.ts (or vice versa) and add a
fixture case, not just eyeball that they "look the same".

DEVIATION (flagged per the working agreement): `manualStatusOverride` is
DROPPED from these signatures entirely, per Table 2's own "additional finding"
-- it's dead optionality in the TS original (never written anywhere in
`lib/db.ts`, `lib/game-updater.ts`, or `types/game.ts`; only
`lib/game-utils.ts` itself references the name). Table 2 explicitly recommends
not carrying it forward as a real field "unless wired up to an admin path" --
none exists, so it's omitted here rather than ported as unused optionality.

DEVIATION (testability only, not a behavior change): each function accepts an
optional keyword-only `now` to inject a fixed reference instant, mirroring how
the TS test suite freezes `Date.now()` with jest fake timers. Production
callers never pass it -- `now=None` defaults to the real wall clock, exactly
matching the TS original's unconditional `new Date()`.
"""
from datetime import datetime, timedelta, timezone
from typing import Mapping, Optional

# Matches computeGameStatus's "2.5 hour buffer" constant (lib/game-utils.ts:47).
_GAME_END_BUFFER = timedelta(hours=2.5)


def _now(now: Optional[datetime]) -> datetime:
    return now if now is not None else datetime.now(timezone.utc)


def _parse_time(value) -> datetime:
    """Accepts either a Mongo-driver `datetime` (already tz-aware, per
    mongodb.py's `tz_aware=True`) or an ISO-8601 string (as `date-fns
    parseISO` would parse in the TS original). Assumes UTC if a naive value
    somehow shows up, so comparisons against an aware `now` never raise."""
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    text = value.replace("Z", "+00:00") if value.endswith("Z") else value
    parsed = datetime.fromisoformat(text)
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)


def compute_game_status(game: Mapping, *, now: Optional[datetime] = None) -> str:
    """Port of lib/game-utils.ts:20-57 `computeGameStatus` -- the single source
    of truth for game-pickability timing. `game` is a mapping with optional
    `startTime`/`date`/`status` keys (matches the TS structural type, minus
    the dropped `manualStatusOverride` -- see module docstring)."""
    current_time = _now(now)

    if game.get("status") == "completed":
        return "completed"

    # SUR-008: a postponed game's stored status always wins, same as "completed"
    # above -- its startTime is stale (either the original, now-void kickoff, or
    # not yet known) and must not be used to compute a time-based status.
    if game.get("status") == "postponed":
        return "postponed"

    game_start_time = game.get("startTime") or game.get("date")
    if not game_start_time:
        return game.get("status") or "not_started"

    start_time = _parse_time(game_start_time)
    game_end_buffer = start_time + _GAME_END_BUFFER

    if current_time > game_end_buffer:
        return "completed"
    elif current_time > start_time:
        return "in_progress"
    else:
        return "not_started"


def can_pick_from_game(game: Mapping, *, now: Optional[datetime] = None) -> bool:
    """Port of lib/game-utils.ts:63-65."""
    return compute_game_status(game, now=now) == "not_started"


def can_change_existing_pick(existing_pick_game: Mapping, *, now: Optional[datetime] = None) -> bool:
    """Port of lib/game-utils.ts:122-137. Deliberately time-only (does NOT
    consult `status`, unlike `compute_game_status`) -- ported faithfully as-is,
    including the resulting edge case where a game with `status: "completed"`
    but a future `startTime` still allows a pick change (see the golden
    fixture "completed by stored status trumps a future startTime")."""
    current_time = _now(now)
    game_start_time = existing_pick_game.get("startTime") or existing_pick_game.get("date")
    if not game_start_time:
        return True
    start_time = _parse_time(game_start_time)
    return current_time <= start_time


def has_gameweek_started(league: Mapping, target_week: Optional[int] = None) -> bool:
    """Port of lib/game-utils.ts:178-195. `league` is a mapping with
    `current_pick_week`/`current_game_week` keys (either may be `None`,
    matching the TS `number | null | undefined` union -- both fall back to 0,
    same as the TS `|| 0`)."""
    pick_week = league.get("current_pick_week") or 0
    game_week = league.get("current_game_week") or 0

    if target_week is not None:
        return target_week <= game_week and game_week > 0

    return pick_week == game_week and pick_week > 0


def are_picks_locked(has_existing_pick: bool, gameweek_started: bool) -> bool:
    """Port of lib/game-utils.ts:201-203."""
    return gameweek_started and has_existing_pick
