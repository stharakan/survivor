"""One-time index creation for the league_seasons split (SUR-010).
Run with: cd api && uv run --project .. python -m app.db.indexes
"""
import asyncio

from pymongo.errors import OperationFailure

from app.db.mongodb import Collections, close_client, get_database


async def _create_index(collection, keys, *, name: str, unique: bool = False) -> None:
    """Create index, skipping gracefully if it already exists under a different name (code 85)."""
    try:
        await collection.create_index(keys, unique=unique, name=name)
        print(f"  Created: {name}")
    except OperationFailure as e:
        if e.code == 85:
            print(f"  Skipped (already exists with different name): {name}")
        else:
            raise


async def ensure_indexes() -> None:
    db = get_database()

    # league_seasons: unique index on {leagueId, season}
    await _create_index(
        db[Collections.LEAGUE_SEASONS],
        [("leagueId", 1), ("season", 1)],
        name="league_seasons_leagueId_season_unique",
        unique=True,
    )

    # league_memberships: unique index on {leagueSeasonId, userId}
    await _create_index(
        db[Collections.LEAGUE_MEMBERSHIPS],
        [("leagueSeasonId", 1), ("userId", 1)],
        name="memberships_leagueSeasonId_userId_unique",
        unique=True,
    )

    # league_invitations: port of the TS invitations_league_active index
    await _create_index(
        db[Collections.LEAGUE_INVITATIONS],
        [("leagueSeasonId", 1), ("isActive", 1)],
        name="invitations_leagueSeasonId_isActive",
    )

    print("Done.")


if __name__ == "__main__":
    asyncio.run(ensure_indexes())
    close_client()
