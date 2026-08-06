# CR-105 Phase 1 — Implementation Report

**Scope executed**: project skeleton + Pydantic models + `lib/db.ts`/`lib/scoring.ts`/
`lib/game-updater.ts` port, per `tickets/CR-105-FINDINGS.md` Table 1 (Ranks 1-7) and
Table 4. No routes, no `lib/game-utils.ts` port, no JWT/auth — those are Phase 2.
All code is new and additive under `api/`; nothing in the existing Next.js app was
touched. Left uncommitted for review.

**Verification performed**: every file passes `python3 -m py_compile`; every
module imports cleanly in a fresh venv with the pinned `requirements.txt`
(`app.main` + all 12 model modules + all 11 db modules — no circular imports);
smoke-tested model construction for the two drift fixes (`League.id`/`createdBy`
as `str`, `Pick.result` accepting `"draw"`) and the `LeagueMembershipWithUserDetails`
composition pattern used in `memberships.py`; directly verified the `createPick`
draw-handling bug fix (`calculate_pick_result` on an already-completed 1-1 game
now returns `"draw"` for both the home- and away-team picker, not `"loss"`). Not
run against a live MongoDB instance — no docker/mongod available in this
environment; a reviewer with a running Mongo should exercise `get_league_by_id`
etc. against real data before Phase 2 builds routes on top of this.

## File list

```
api/
  README.md
  requirements.txt
  app/
    __init__.py
    main.py                    FastAPI app instance, GET /health only, no other routes
    models/
      __init__.py
      team.py                  Team
      game.py                  GameStatus, GameUserPick, Game
      pick.py                  Pick                              [DRIFT FIX 1]
      league.py                League, LeagueMembership,
                                UserSummary, LeagueMembershipWithUserDetails  [DRIFT FIX 2]
      user.py                  User
      invitation.py            LeagueInvitation, InvitationWithLeague,
                                CreateInvitationRequest, InvitationAcceptanceInfo
      password_reset.py        PasswordResetToken and family
      player.py                Player
      season_summary.py        PrizeType, PrizeWinner, FinalStanding, SeasonSummary
      team_picks_remaining.py  TeamPicksRemaining                 [NEW MODEL]
      player_profile.py        PlayerProfile                      [NEW MODEL]
      results.py               UserWeekPick, UserResults, ResultsData  [NEW MODEL, non-types/]
    db/
      __init__.py
      mongodb.py                Motor client + Collections (port of lib/mongodb.ts)
      _shape.py                 shared Mongo-doc -> Pydantic shaping helpers
      auth.py                   Rank 1: create_user, get_user_by_email, get_user_by_id,
                                 verify_password, update_user
      leagues.py                Rank 2: create_league, get_league_by_id,
                                 update_league_settings, get_all_leagues,
                                 get_available_leagues, start_new_season  [NEW CAPABILITY]
      memberships.py             Rank 3: create_league_membership,
                                 get_user_league_memberships, get_league_members,
                                 get_league_members_with_user_data, get_league_member,
                                 update_member_status, remove_member_from_league
      games.py                   Rank 4: get_games_by_week, get_game_time_info_by_id,
                                 get_all_teams, get_games_by_week_with_picks
      picks.py                   Rank 5: create_pick [BUG FIX], get_user_picks_by_league,
                                 get_user_pick_for_week
      invitations.py             Rank 6: create_league_invitation, get_league_invitations,
                                 get_invitation_by_token, accept_invitation,
                                 revoke_invitation
      scoring.py                  Rank 7: calculate_pick_result, update_pick_results,
                                 calculate_scores_and_strikes, run_scoring_calculation
      results.py                  Rank 7: get_scoreboard_with_picks, get_league_results,
                                 get_season_summary
      game_updater.py             Rank 7: update_game_scores (+ 11 private helpers)
tickets/
  CR-105-PHASE1-REPORT.md    this file
```

33/33 `MOVE-TO-PYTHON` `lib/db.ts` functions from Table 1 are ported (Ranks 1-7),
plus all 3 `lib/scoring.ts` exports and the 1 `lib/game-updater.ts` export
(`updateGameScores`, with its private helpers). `createGame`, `createGameIndexes`,
`createInvitationIndexes`, and `initializeDefaultData` are deliberately absent —
cut list / dev-tooling exception, per Table 1's own dispositions.

## The 3 drift fixes

1. **`Pick.result` missing `"draw"`** (`app/models/pick.py`). TS declared
   `"win" | "loss" | null`; `lib/scoring.ts`'s `calculatePickResult` can and does
   write `"draw"`. Fixed as `Literal["win", "draw", "loss"] | None`.

2. **`League.id` / `League.createdBy` typed `number`, actually `str`**
   (`app/models/league.py`). Every write/read site in `lib/db.ts` does
   `.toString()` on a Mongo `ObjectId`. Fixed as `id: str`, `createdBy: str`.
   This is enforced at construction time now — `league_from_doc`/every league
   assembly in `app/db/leagues.py` and `app/db/memberships.py` passes real
   strings, and Pydantic would reject a stray `int` immediately (unlike the TS
   `as League` cast, which the CR-105 findings note is silently masked by
   `ignoreBuildErrors: true`).

3. **`createPick`'s inline result computation had no draw branch** — a genuine
   scoring bug, not just a type gap (`app/db/picks.py::create_pick`). The
   original TS (`lib/db.ts:801-809`) computed `result = homeScore > awayScore ?
   "win" : "loss"` with no tie case, so picking into an already-completed drawn
   game permanently mis-scored the pick `"loss"` (the periodic scoring job only
   ever revisits `null` results, so it's never corrected). Fixed by routing
   `create_pick` through the same `calculate_pick_result` helper
   `app/db/scoring.py` uses — one source of truth for win/draw/loss, computed
   identically at creation time and at scoring time. Verified directly: a pick
   into a 1-1 completed game now resolves to `"draw"` for both the home- and
   away-team picker (see Verification section above).

## New models (not in the original 23 `types/` exports)

- **`TeamPicksRemaining`** (`app/models/team_picks_remaining.py`) — names the
  anonymous `{team: Team, remaining: number}[]` shape `GET /api/picks/remaining`
  returns today.
- **`PlayerProfile`** (`app/models/player_profile.py`) — the CR-105 Addendum
  flagged `getPlayerProfile` as needing a real model since `Player` (the
  scoreboard-row type) is too thin. **Judgment call, flagged for Phase 2 review**:
  I sized this against what `app/player/[id]/page.tsx` actually renders (id, a
  display name, team name, points/strikes/rank, a picks list, and a season-progress
  bar). The page today makes *two* separate calls (`getPlayerProfile` +
  `getUserPicks`) and hardcodes `38` as the season length. I folded the picks list
  into one response (`picks: List[Pick]`) and added a real `totalWeeksInSeason`
  field instead of porting the hardcoded `38` — in the spirit of "build it for
  real" from the cut-list decision on this item, not just typing the existing
  (currently broken) two-call shape as-is. **Confirm this consolidation before
  Phase 2 wires the actual route** — an alternative reading is "keep it two calls,
  just type each one," which is a smaller change if that's preferred.
- **`ResultsData`/`UserResults`/`UserWeekPick`** (`app/models/results.py`) — not
  flagged in the Addendum, but `getLeagueResults` (`lib/db.ts:1582-1594`) types
  its own return shape inline (`ResultsData` interface) rather than exporting it
  from `types/`. Needed a real model to type this port's return value; a minor
  addition beyond Table 4's list, not a contradiction of it.

## Other judgment calls / deviations (flagged for review)

- **`InvitationCreatorSummary.username` / `InvitationAcceptanceInfoCreator.username`
  / the password-reset family's `username` fields made `Optional[str]`, not
  required `str`** (`app/models/invitation.py`, `app/models/password_reset.py`).
  Found during the port, not previously flagged in CR-105-FINDINGS.md: the TS
  types declare `username: string` (required) on these nested shapes, but the
  `users` collection never actually has a `username` field — `createUser`/
  `updateUser` (`lib/db.ts`) only ever write `email`/`name`. A strict
  required-`str` Pydantic model would raise a `ValidationError` on every real
  invitation/password-reset row. This is the same class of bug as the
  `League.id`/`createdBy` drift CR-105 already caught — a required-in-TS field
  that's actually always-undefined at runtime — just not named in the findings
  because Table 4 didn't audit every nested inline shape with equal rigor
  (it says as much for `InvitationWithLeague`/`InvitationAcceptanceInfo`/
  `PasswordResetTokenWithUser`/`PasswordResetValidationInfo`: "recommend a
  spot-check," which this port did). **Recommend treating this as a fourth
  drift-fix, not just a Phase 1 implementation detail** — worth a one-line
  addition to CR-105-FINDINGS.md Table 4 if that file gets revisited.
- **`start_new_season`'s `seasonArchive` field** (`app/db/leagues.py`) is a new
  field on the `League` document with no existing schema precedent (no rollover
  has ever happened in this codebase). I designed it as an array of
  `{season, archivedAt, summary}` entries pushed via `$push`, so multiple past
  seasons accumulate on one league document. **Confirm this shape in Phase 2**
  before building a "past seasons" UI on top of it — this was invented, not
  ported, per the Addendum's explicit note that season rollover has no TS
  implementation to diff against.
- **`start_new_season` takes a caller-supplied `archive_summary`** rather than
  computing it internally. The Addendum's "archive if not already done" is an
  idempotency policy I judged belongs to the caller/route (Phase 2), not
  something a data-access function should silently decide on its own.
- **`_find_game_in_bulk_response`'s date matching** (`app/db/game_updater.py`)
  is UTC-only; the TS original's `date-fns format()` uses the server's local
  timezone by default. Flagged inline in the code and here: identical behavior
  only if the deploy target actually runs in UTC. Confirm against the real
  deploy environment in Phase 2 rather than assuming equivalence.
- **`get_league_members_with_user_data`'s League sub-object is now always fully
  populated** (`app/db/memberships.py`). The TS original inlines a *different*,
  narrower League shape at this one call site (missing `hideScoreboard`/
  `current_*_week` — every other League-returning function in `lib/db.ts`
  includes them). I used the same shared `league_from_doc` helper everywhere,
  which normalizes this one inconsistency rather than reproducing it — required
  for the Pydantic model to validate at all (those fields are non-optional on
  `League`), not just a style choice. Flagged in case a future caller was
  relying on the narrower shape (unlikely, but noted).

## Known gaps intentionally carried forward, not fixed (per the brief)

- **No authorization anywhere in `app/db/`.** Every function trusts its caller
  for identity/ownership. Comments are left at the specific points Phase 2 must
  add checks (`create_pick` for the missing-auth gap on `POST /picks`,
  `get_user_league_memberships`-adjacent routes for the missing ownership check
  on `GET /users/[userId]/leagues`, etc.) — these mirror the gaps
  CR-105-FINDINGS.md already named as "carried forward as a bug to fix during
  the port," not something Phase 1's data-access layer should silently patch.
- **`_find_matching_database_game` still raises hard** on a missing/unmatched
  external game ID (`app/db/game_updater.py`), same as the TS original and the
  epic's own "Latent Bugs Surfaced During Review" note. Not one of the two
  authorized fixes for this ticket — preserved as-is, flagged in a code comment.
- **`creator.username` in `invitations.py`** reads a field that's never written
  (see the deviation note above) — ported as `.get()` (returns `None`) rather
  than raising, matching the TS original's silent `undefined`, not fixed at the
  data layer since the real fix is either writing a `username` field somewhere
  or removing the field from the contract, both of which are product/Phase 2
  decisions.

## What Phase 2 needs to know before starting

- Build routes in Rank 1→7 order on top of this layer, matching
  `CR-105-FINDINGS.md` Table 1 and this repo's `api/README.md`.
- JWT verification, `lib/auth-utils.ts`'s `authorizeRequest`/
  `validateAdminPermission` port, and `lib/game-utils.ts`'s server-validation
  half (`canPickFromGame`, `canChangeExistingPick`, `hasGameweekStarted`,
  `arePicksLocked`) are all still to build — none of it exists in `api/` yet.
- `app/db/games.py::get_game_time_info_by_id` and the shape of `create_pick`'s
  inputs were written anticipating that pick-lock validation will sit in the
  future route handler, calling into these — check the inline comments in
  `picks.py`/`games.py` for the specific seams.
- The `PlayerProfile`/`ResultsData` judgment calls above are the two places
  most likely to need a second look before Phase 2 locks in an actual route
  contract.
