# CR-105 Phase 2 — Implementation Report

**Scope executed**: the full route layer on top of Phase 1's `app/db/` (routes
for Ranks 1–7 per `CR-105-FINDINGS.md` Table 1), JWT issuance/verification
(direct-in-FastAPI, no BFF proxy, per the already-decided auth boundary), the
`lib/auth-utils.ts` port, the `lib/game-utils.ts` server-side-consumed half
port plus its required golden-fixture parity test, and live-MongoDB
verification of both Phase 1's data-access layer and every new route. All
three of Addendum 2's non-negotiable items are done — see their own sections
below. Left uncommitted for review, per the working agreement.

## File list

```
api/
  pytest.ini                    session-scoped asyncio loop (see Verification)
  requirements.txt               + pydantic[email], pytest, pytest-asyncio
  app/
    main.py                      wires all routers + exception handlers  [MODIFIED]
    core/
      config.py                  JWT_SECRET/cookie/API-key env config
      security.py                 JWT issuance/verification (python-jose)
      responses.py                 ApiResponse envelope + FastAPI exception handlers
      auth_deps.py                  port of lib/auth-utils.ts + cookie/JWT extraction
    utils/
      game_utils.py                 port of lib/game-utils.ts's 5 server-consumed fns
    models/
      requests.py                   request-body models (port of api-types.ts's zod schemas)
      player_profile.py             [MODIFIED — pre-existing Addendum 2 edit, not this
                                     session's; see "Pre-existing changes" below]
    db/
      _shape.py                     [MODIFIED] game_from_doc: startTime now via to_iso()
      memberships.py                 [MODIFIED] + get_membership_for_user (NEW)
      invitations.py                 [MODIFIED] + get_invitation_league_id (NEW)
      player_profile.py               NEW — get_player_profile (Table 3 item 4, build-for-real)
    routers/
      auth.py                         Rank 1: login/logout/register/verify
      users.py                        Rank 1: GET/PATCH /users/{id}, GET /users/{id}/leagues
      password_reset.py               Rank 1: generate-reset-link, reset-password
      leagues.py                      Rank 2: GET/POST /leagues, GET/PATCH /leagues/{id}
      members.py                      Rank 3: league members CRUD
      games.py                        Rank 4: GET /games
      picks.py                        Rank 5: GET/POST /picks, GET /picks/remaining
      invitations.py                  Rank 6: invitations CRUD + accept/lookup
      results.py                      Rank 7: results/scoreboard/season-summary + NEW player-profile route
      admin_scoring.py                Rank 7: recompute-scores, update-game-scores
tests/
  test_game_utils_parity.py           Python half of the required golden-fixture test
  test_live_mongo_smoke.py            live-Mongo verification, re-runnable (not a one-off)
lib/__tests__/
  game-utils-parity.test.ts           TS half of the required golden-fixture test
test-fixtures/
  game-utils-golden.json              shared fixtures both suites load
```

24/24 Table 1 routes are implemented except the deliberately-omitted
`DELETE /leagues/{leagueId}` (cut list, Table 3 item 9) — 23 routes, plus one
genuinely new route (`GET /leagues/{leagueId}/players/{userId}/profile`,
Table 3 item 4's build-for-real disposition).

## The three Addendum 2 non-negotiables

### 1. Picks privacy boundary

Every route that returns pick data now enforces **requester == queried user**
as a real authorization check (`app/core/auth_deps.py::require_self`), not a
frontend convention:

- `GET /picks` (`app/routers/picks.py`)
- `POST /picks` — stronger than a query-param check: there is no `userId`
  field on the request body at all anymore (`app/models/requests.py`'s
  `CreatePickRequest`); the acting user is always the JWT-verified caller.
- `GET /picks/remaining`
- `GET /games` when `user_id` is supplied (this determines whose picks get
  embedded in `Game.userPick` — same class of gap, not previously named as
  precisely in Table 1's `GET /games` bug note, so flagged as a deviation
  below)

`PlayerProfile` (`GET /leagues/{leagueId}/players/{userId}/profile`) stays
public-within-league and returns no pick data, exactly as Phase 1's reversed
model shipped it. Verified live: registered two users, had one try to read
the other's picks (403), confirmed self-read works (200).

### 2. `lib/game-utils.ts` port + golden-fixture parity test

`app/utils/game_utils.py` ports the 5 functions Table 2 names as having a
real server-side consumer: `compute_game_status`, `can_pick_from_game`,
`can_change_existing_pick`, `has_gameweek_started`, `are_picks_locked`. The
other 6 exports are pure UI helpers with zero `app/api/*` importers — Table 2
already confirmed these don't need a Python port, and they don't have one.

**Parity test**: `test-fixtures/game-utils-golden.json` pins a fixed `now`
reference instant and 19 cases (8 game-status/pick/change-pick, 7
gameweek-started, 4 picks-locked). `lib/__tests__/game-utils-parity.test.ts`
freezes `Date.now()` with jest fake timers and runs the real
`lib/game-utils.ts` against every case (35 assertions, **verified passing
against the actual TS source before any Python code was written** — this
caught zero fixture-authoring mistakes, but the intent was to make the
fixture the ground truth, not my own re-derivation of the TS logic).
`api/tests/test_game_utils_parity.py` runs the same 19 cases through
`app/utils/game_utils.py` (35 assertions). Both pass:

```
$ npx jest lib/__tests__/game-utils-parity.test.ts
Tests: 35 passed, 35 total

$ pytest api/tests/test_game_utils_parity.py
35 passed
```

**Deviation, flagged**: `manualStatusOverride` is dropped from the Python
signatures entirely, per Table 2's own recommendation ("either wire up an
admin path... or drop it during the port" — no admin path exists, so
dropped). `can_change_existing_pick` also accepts an optional keyword-only
`now` for test determinism (production callers never pass it; defaults to the
real wall clock, matching the TS original's unconditional `new Date()`).

### 3. Live MongoDB verification

Stood up `mongo:7` in a local Docker container (`docker run -d -p
27117:27017 mongo:7`) and exercised the system two ways:

1. **Manual end-to-end session** (curl against a running `uvicorn` process,
   real requests, real cookies) covering: register → login → verify →
   create league → create membership (had to insert directly via
   `create_league_membership` — see "Judgment calls" below) → get
   league/members/scoreboard/results/season-summary → create invitation →
   second user accepts invitation → picks create/list/remaining/change →
   games-with-picks → admin makes member an admin → member self-removal and
   league-creator-removal protections → admin generates a password-reset
   link → target user validates and completes the reset → logs in with the
   new password → recompute-scores with a real API key. All behaved as
   designed; no unexpected failures except the one genuine bug this
   uncovered (below).
2. **Automated, re-runnable smoke tests** (`api/tests/test_live_mongo_smoke.py`,
   skips cleanly without `MONGODB_URI` so it doesn't break a Mongo-less CI
   run): user CRUD round-trip, league+membership round-trip (including a
   live assertion that `League.id`/`createdBy` really do come back as `str`
   off a real `ObjectId`, not the old TS `number`), and a live re-verification
   of the `create_pick` draw-handling bug fix for **both** the home- and
   away-team picker against a real completed 1-1 game.

```
$ MONGODB_URI=mongodb://localhost:27117 pytest api/tests/ -q
38 passed
$ pytest api/tests/ -q   # without MONGODB_URI
35 passed, 3 skipped
```

**Bug found by this verification** (not previously known, not in any Table):
`app/db/_shape.py::game_from_doc` passed `startTime` through raw instead of
via `to_iso()` (unlike `date`, which already went through it). A live game
document with `startTime` stored as a native Mongo `datetime` — which cannot
happen via the current write paths I traced
(`scripts/import-epl-2025-fixtures.ts` only ever writes `date`; `startTime`
is first populated by `game_updater.py` as an already-ISO string from the
Football Data API) but has no schema-level guarantee against — raised a hard
Pydantic `ValidationError` where the TS original would have silently
`JSON.stringify`'d the `Date` into an ISO string for free. Fixed to match
`date`'s handling; verified via a live insert reproducing the exact shape,
confirmed fixed. Flagged as a deviation since it's a defensive fix beyond
what any Table named, not a silent one.

## Bug fixes named by Table 1, verified fixed

- **`GET /users/{userId}` (1.10)** and **`GET /users/{userId}/leagues`
  (1.11)**: were fully public; now self-only. Verified live: a second user
  gets 403 on both.
- **`GET /games` (4.7)**: had no in-route auth. Now requires authentication
  and league membership, plus the picks-privacy self-only check when
  `user_id` is supplied (see item 1 above — Table 1 didn't call out this
  specific sub-gap, since it wasn't visible without also reading how
  `Game.userPick` gets populated).
- **`GET/POST /picks`, `GET /picks/remaining` (5.4/5.5)**: fully fixed per
  Addendum 2, see above.
- **`DELETE /invitations/{invitationId}` (6.7)**: TS comment admitted "any
  authenticated user for now." Now requires the caller be an admin of the
  invitation's actual owning league (`get_invitation_league_id`, new).
  Verified live: a non-admin gets rejected before being promoted; an admin
  of the correct league succeeds.
- **`Pick.result` missing `"draw"` + `createPick`'s tie-handling bug**
  (Table 4): re-verified against live Mongo in this phase (Phase 1 only unit
  -tested it), for both home- and away-team pickers.
- **`League.id`/`createdBy` `number` vs `str` drift** (Table 4): re-verified
  live — a real `ObjectId.toString()` round-trips through the Pydantic model
  as `str`, confirmed via an explicit `isinstance` assertion in the smoke
  test.

## Judgment calls / deviations (flagged, not silently decided)

- **Status-code policy normalized, not string-matched.** The TS routes
  re-derive HTTP status from `error.message.includes(...)` checks that differ
  slightly at every call site — e.g. the members `DELETE` route's
  `verifyAuthToken()` call isn't wrapped in its own `try/catch`, so an
  unauthenticated `DELETE` falls through to the outer `handleApiError` and
  gets treated as a 500 instead of 401. This port has every authorization
  helper raise `ApiError(message, status_code)` with the correct code at the
  point of failure (`app/core/auth_deps.py`), so 401/403/400/404 are
  consistent everywhere these helpers are reused, and that specific masking
  bug cannot recur. Not one of the two named bugs (`Pick.result` draw,
  `League.id`/`createdBy`) — flagged as an additional call, per the working
  agreement, since it changes observable status codes for a handful of
  previously-inconsistent edge cases (never for the success path or the
  primary error case of any route).
- **`GET /users/{userId}` self-only, not "any authenticated user."** Table 1
  1.10 says the no-auth gap needs fixing but doesn't specify the exact
  policy. Since the response includes `email` (PII) and the existing `PATCH`
  on the same resource was already self-only, I matched that policy rather
  than inventing a looser "any member can view any user" rule. Revisit if a
  legitimate cross-user profile-lookup need surfaces later (unlikely — the
  new `PlayerProfile` route exists for the in-league public case).
- **`Authorization: Bearer` accepted alongside the `auth-token` cookie**
  (`app/core/auth_deps.py::_extract_token`). Purely additive — the frontend
  continues to rely solely on the cookie, unchanged. Added because this
  backend has no browser cookie jar the way the TS app's own frontend does;
  useful for non-browser clients/tests (used throughout this phase's own
  curl verification).
- **`PlayerProfile.name` uses the same `"TeamName (UserName)"` display
  convention `results.py`'s `_base_player` already uses**, rather than the
  literal hardcoded `"Tharakan Warriors"` string `app/player/[id]/page.tsx:111`
  renders today (which was never real data). `totalWeeksInSeason` is computed
  from the actual fixture list (`max(week)` for the league's sport/season) —
  continuing Phase 1's "build it for real" judgment call on this model rather
  than reverting to the old hardcoded `38`.
- **`get_membership_for_user` (new) reuses the shared `_membership_from_agg`/
  `league_from_doc` shaping** instead of re-duplicating
  `lib/auth-utils.ts`'s own second, slightly narrower inline object literal
  (`lib/auth-utils.ts:92-117`) for the same underlying membership lookup.
  Same data, factored through the one helper already used everywhere else in
  `memberships.py` — not a behavior change.
- **`app/player/[id]/page.tsx` (frontend) is unchanged.** Addendum 2 states
  this page "should only ever call the profile endpoint for another user,
  never a picks endpoint for anyone but the logged-in user" — that's the
  design constraint the new `PlayerProfile` route and the picks self-only
  check satisfy, but the Next.js frontend still calls the old `app/api/*` TS
  routes (`lib/api.ts`), not this Python API. Wiring the frontend to the new
  backend wasn't named in Phase 2's scope (routes only) and is left for
  whichever phase handles the frontend cutover.
- **CORS is not configured.** Not named in Phase 2's scope or the README's
  "Not in this phase" list either; the manual verification session talked to
  the API directly (curl), not through a browser. Needed before any real
  browser-based frontend cutover.

## Pre-existing items, not from this session

- `api/app/models/player_profile.py`'s diff (picks field removal) was
  already applied before this session started — it's Addendum 2's own
  decision, already shipped. Not touched again here; the new
  `app/db/player_profile.py::get_player_profile` was built against the
  already-`picks`-free model.
- `lib/__tests__/scoring.test.ts` has 22 pre-existing failures (`mockCollection`
  missing a `.project()` method, unrelated to anything in this phase) —
  confirmed via `git stash` that they fail identically with none of this
  session's files present. `lib/scoring.ts` itself was not touched. Not
  fixed here; flagged as a pre-existing gap this session happened to notice.

## What Phase 3 (if any) needs to know

- **Frontend cutover** — pointing `lib/api.ts`/`lib/api-client.ts` at this
  API instead of the Next.js `app/api/*` routes, plus updating
  `app/player/[id]/page.tsx` to stop calling a picks endpoint for other
  users — is not started. This phase only built the Python-side contract.
- **CORS** needs configuring before any real browser calls this API
  cross-origin.
- **Season rollover** (`start_new_season`) is still deliberately unwired, per
  Addendum 2 — unchanged this phase.
- **`update-game-scores`** was not exercised end-to-end against the real
  Football Data API in this phase's live verification (no
  `FOOTBALLDATA_API_KEY` in this environment) — only its auth gate
  (`X-API-Key`) was verified. The scoring-trigger path
  (`_check_and_trigger_scoring` → `run_scoring_calculation`) was verified
  independently via `recompute-scores`.
- Once a CI environment exists for `api/` (referenced as future work in
  `requirements.txt`'s header comment), `test_live_mongo_smoke.py` is ready
  to run there against a service-container Mongo — it already skips cleanly
  without one.
