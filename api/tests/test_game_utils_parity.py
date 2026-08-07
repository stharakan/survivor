"""Golden-fixture parity test for app/utils/game_utils.py -- the Python half of
the pair required by CR-105-FINDINGS.md Table 2 / Addendum 2. The TS half is
lib/__tests__/game-utils-parity.test.ts; both load the same fixture file
(test-fixtures/game-utils-golden.json, repo-root-relative) and must assert
identical booleans for identical inputs. See app/utils/game_utils.py's module
docstring for the full rationale.
"""
import json
from datetime import datetime
from pathlib import Path

import pytest

from app.utils.game_utils import (
    are_picks_locked,
    can_change_existing_pick,
    can_pick_from_game,
    compute_game_status,
    has_gameweek_started,
)

FIXTURES_PATH = Path(__file__).resolve().parents[2] / "test-fixtures" / "game-utils-golden.json"


def _load_fixtures() -> dict:
    with open(FIXTURES_PATH) as f:
        return json.load(f)


FIXTURES = _load_fixtures()
NOW = datetime.fromisoformat(FIXTURES["now"].replace("Z", "+00:00"))


@pytest.mark.parametrize("case", FIXTURES["gameStatusCases"], ids=lambda c: c["name"])
def test_compute_game_status(case):
    assert compute_game_status(case["game"], now=NOW) == case["expectStatus"]


@pytest.mark.parametrize("case", FIXTURES["gameStatusCases"], ids=lambda c: c["name"])
def test_can_pick_from_game(case):
    assert can_pick_from_game(case["game"], now=NOW) == case["expectCanPick"]


@pytest.mark.parametrize("case", FIXTURES["gameStatusCases"], ids=lambda c: c["name"])
def test_can_change_existing_pick(case):
    assert can_change_existing_pick(case["game"], now=NOW) == case["expectCanChange"]


@pytest.mark.parametrize("case", FIXTURES["gameweekStartedCases"], ids=lambda c: c["name"])
def test_has_gameweek_started(case):
    assert has_gameweek_started(case["league"], case["targetWeek"]) == case["expect"]


@pytest.mark.parametrize("case", FIXTURES["picksLockedCases"], ids=lambda c: c["name"])
def test_are_picks_locked(case):
    assert are_picks_locked(case["hasExistingPick"], case["gameweekStarted"]) == case["expect"]
