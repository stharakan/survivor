"""NEW, no TS twin. Backs the admin-only "AI Teams" tab (SUR-011-ish, no ticket
filed yet -- discussed inline with the user rather than ticketed first).

Deliberately reuses existing, already-tested read functions rather than new
queries: get_user_picks_by_league (app/db/picks.py) for full pick history
(every pick, not just scored ones -- avoids undercounting a team as "used"
just because its game hasn't been scored yet), get_games_by_week
(app/db/games.py) for the target week's real fixtures, and get_league_member
(app/db/memberships.py) for strikes/points/rank/current_pick_week. Submission
reuses create_pick (app/db/picks.py) directly -- same twice-per-team
enforcement as every other pick, no parallel validation path.

Router-level responsibility (app/routers/members.py), not this module's:
verifying the caller is a league admin AND that the target member is
isAI -- this module trusts its caller on authorization, same division of
labor as memberships.py's inner-circle functions.
"""
from app.db.games import get_games_by_week
from app.db.memberships import get_league_member
from app.db.picks import get_user_picks_by_league

_RULES = """You are an elite soccer analyst and game theorist advising one team in a
private EPL Fantasy Survivor League.

### 1. Game Rules
- Weekly Action: Pick exactly one EPL team that is playing this week.
- Match Outcomes: Win = 3 pts | Draw = 1 pt | Loss = 1 strike.
- Elimination: 2 strikes and you're out.
- Constraint: The same team can be picked at most twice across the season."""

_STRATEGY = """### 4. Strategy Objectives
- Avoid strikes above all else -- prioritize the safest realistic result.
- Don't burn a team you may need for a harder week later if a safer option
  exists now.
- Balance short-term safety with staying competitive for a top-2 finish.

### 5. Required Output Format
Respond with ONLY the exact team name as written in section 3 above --
nothing else. No explanation, no punctuation, no extra words."""


async def build_ai_prompt(league_season_id: str, member_id: str) -> dict:
    """Assembles this week's personalized prompt + the raw data the frontend
    needs for the pick-submission dropdown (fixtures with gameId/teamId)."""
    member = await get_league_member(league_season_id, member_id)
    if not member:
        raise ValueError("Member not found")

    week = member.league.current_pick_week or 1

    all_picks = await get_user_picks_by_league(member.user, league_season_id)
    history = sorted(
        [{"week": p.week, "teamName": p.team.name, "result": p.result} for p in all_picks],
        key=lambda h: h["week"],
    )

    team_counts: dict[str, int] = {}
    for p in all_picks:
        team_counts[p.team.name] = team_counts.get(p.team.name, 0) + 1
    maxed_out_teams = sorted(name for name, count in team_counts.items() if count >= 2)

    games = await get_games_by_week(week, league_season_id)
    fixtures = [
        {
            "gameId": g.id,
            "homeTeam": {"id": g.homeTeam.id, "name": g.homeTeam.name},
            "awayTeam": {"id": g.awayTeam.id, "name": g.awayTeam.name},
        }
        for g in games
    ]

    prompt_text = _render_prompt(
        week=week,
        strikes=member.strikes,
        points=member.points,
        rank=member.rank,
        total_players=member.league.memberCount,
        history=history,
        team_counts=team_counts,
        maxed_out_teams=maxed_out_teams,
        fixtures=fixtures,
    )

    return {
        "teamName": member.teamName,
        "week": week,
        "strikes": member.strikes,
        "points": member.points,
        "rank": member.rank,
        "totalPlayers": member.league.memberCount,
        "history": history,
        "teamsUsed": team_counts,
        "maxedOutTeams": maxed_out_teams,
        "fixtures": fixtures,
        "promptText": prompt_text,
    }


def _render_prompt(
    *, week, strikes, points, rank, total_players, history, team_counts, maxed_out_teams, fixtures
) -> str:
    if history:
        history_lines = "\n".join(
            f"  Week {h['week']}: {h['teamName']} -> "
            f"{(h['result'] or 'pending').capitalize()}"
            for h in history
        )
    else:
        history_lines = "  (no picks made yet this season)"

    used_teams_line = (
        ", ".join(f"{name} x{count}" for name, count in team_counts.items()) or "(none yet)"
    )
    maxed_out_line = ", ".join(maxed_out_teams) or "(none yet)"

    fixture_lines = "\n".join(
        f"  - {f['homeTeam']['name']} (home) vs {f['awayTeam']['name']} (away)" for f in fixtures
    ) or "  (no fixtures found for this week)"

    return f"""{_RULES}

### 2. Your Current Status
- Strikes so far: {strikes}/2
- Points so far: {points}
- Current league rank: {rank} of {total_players}
- Full pick history:
{history_lines}
- Teams used so far: {used_teams_line}
- Teams now OFF LIMITS (already used twice, cannot be picked again): {maxed_out_line}

### 3. This Week's Fixtures (Week {week})
These are the ONLY valid picks this week. If you have real-time web search
available, use it to check current injury reports, suspensions, and team
news for these clubs before deciding:
{fixture_lines}

{_STRATEGY}"""
