"""SUR-008: pure-function tests for `_map_api_status_to_internal`
(api/app/db/game_updater.py) -- the fix for the bug that mapped
POSTPONED/CANCELLED/SUSPENDED into the same branch as FINISHED/AWARDED,
producing a "completed" game with null scores that could never resolve.

Module-private (leading underscore) by the same convention as its TS
ancestor -- imported directly here per SUR-008's own instruction to treat the
underscore as a test-file-docstring signal, not a "don't test this" signal.
"""
import pytest

from app.db.game_updater import _map_api_status_to_internal


@pytest.mark.parametrize("api_status,expected", [
    ("SCHEDULED", "not_started"),
    ("TIMED", "not_started"),
    ("LIVE", "in_progress"),
    ("IN_PLAY", "in_progress"),
    ("PAUSED", "in_progress"),
    ("HALFTIME", "in_progress"),
    ("FINISHED", "completed"),
    ("AWARDED", "completed"),
    ("POSTPONED", "postponed"),
    ("CANCELLED", "postponed"),
    ("SUSPENDED", "postponed"),
    ("SOME_UNKNOWN_FUTURE_STATUS", "not_started"),
])
def test_map_api_status_to_internal(api_status, expected):
    assert _map_api_status_to_internal(api_status) == expected
