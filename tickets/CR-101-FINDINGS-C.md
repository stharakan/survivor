## AC3 — Contract Mechanism

### 1. Today's type surface (as-is)

The frontend/backend contract currently has **three uncoordinated pieces**, none of
which reference each other:

- **`types/`** (9 files, 249 lines total) — hand-written TS types consumed by UI
  components and `lib/api-client.ts`. E.g. `League` (`types/league.ts:1-18`),
  `LeagueMembership` (`types/league.ts:20-35`), `Game`/`GameStatus`
  (`types/game.ts:6-25`), `Player` (`types/player.ts:1-8`).
- **`lib/api-types.ts`** — Zod schemas, but only for a subset of **request** bodies:
  `loginSchema` (`lib/api-types.ts:24-27`), `registerSchema` (`lib/api-types.ts:29-37`),
  `createLeagueSchema` (`lib/api-types.ts:39-46`), `joinLeagueSchema`
  (`lib/api-types.ts:48-51`), `makePickSchema` (`lib/api-types.ts:53-56`),
  `updateMemberSchema` (`lib/api-types.ts:58-62`), `scoringResultSchema`
  (`lib/api-types.ts:65-70`), `createInvitationSchema` (`lib/api-types.ts:73-76`),
  `acceptInvitationSchema` (`lib/api-types.ts:78-80`). There is **no Zod schema for
  any API response** — only the generic `ApiResponse<T>` envelope
  (`lib/api-types.ts:4-9`).
- **`lib/api-client.ts`** — hand-written fetch wrappers that assert response shapes
  purely via TS generics, e.g. `getScoreboard(): Promise<{ players: Player[];
  currentGameWeek: number | null }>` (`lib/api-client.ts:110-115`),
  `getSeasonSummary(): Promise<SeasonSummary>` (`lib/api-client.ts:267-269`). Several
  functions return untyped `any`/`any[]` outright:
  `createLeagueInvitation` → `Promise<any>` (`lib/api-client.ts:272-281`),
  `getLeagueInvitations` → `Promise<any[]>` (`lib/api-client.ts:283-285`),
  `getInvitationByToken` / `acceptInvitation` → `Promise<any>`
  (`lib/api-client.ts:287-296`).

**Drift already exists today, TS-only, with no CI to catch it:**
- Of the 9 request Zod schemas, only 5 are ever `.parse()`'d server-side:
  `loginSchema` (`app/api/auth/login/route.ts:9`), `registerSchema`
  (`app/api/auth/register/route.ts:9`), `createLeagueSchema`
  (`app/api/leagues/route.ts:65`), `updateMemberSchema`
  (`app/api/leagues/[leagueId]/members/[memberId]/route.ts:61`),
  `createInvitationSchema` (`app/api/leagues/[leagueId]/invitations/route.ts:89`),
  `acceptInvitationSchema` (`app/api/invite/[token]/accept/route.ts:37`).
  `joinLeagueSchema`, `makePickSchema`, and `scoringResultSchema` are defined but
  **never used anywhere** — dead contract code.
- `app/api/picks/route.ts` POST — the exact route `makePickSchema` was built for —
  does not call it at all; it manually destructures the body (`const { userId,
  leagueId, gameId, teamId, week } = body`, `app/api/picks/route.ts:46`) with no
  runtime validation.
- **No API route validates its response shape against `types/` at runtime.**
  Responses are TS-cast from whatever `lib/db.ts` happens to return, e.g. `as
  ApiResponse<typeof picks>` (`app/api/picks/route.ts:33`) and `as
  ApiResponse<typeof pick>` (`app/api/picks/route.ts:129`) — the type is inferred
  from the DB layer's return value at compile time only, not checked against the
  hand-written `types/pick.ts` contract, and not checked at all at runtime.
- `lib/db.ts` has untyped Mongo aggregation results feeding these responses, e.g.
  `new Map<string, Map<number, any>>()` (`lib/db.ts:1744`) and `(member as
  any).userDetails` (`lib/db.ts:1754-1755`) — exactly the "any-typed aggregation
  results" risk DEC-4 calls out.
- With `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true`
  (`next.config.mjs:5,8`), none of the above — not even a plain type mismatch —
  currently blocks a build or a PR. There is no CI at all yet (CR-002 is still
  proposed).
- `zod` is already a dependency (`package.json:67`, `^3.24.1`), so a TS-only
  validated-contract path has zero new install cost.

### 2. Mechanism comparison

| | **Generated** (Pydantic → OpenAPI → `openapi-typescript`) | **Hand-written + CI drift check** |
|---|---|---|
| **What runs in CI** | Backend emits `openapi.json` (FastAPI does this for free from Pydantic models); `openapi-typescript` regenerates `types/` (or a dedicated `types/generated/`) from it; CI fails if `git diff --exit-code` shows the committed generated file is stale. | Existing `tsc --noEmit` (CR-002 AC2) plus a new step: generate `openapi.json` from the backend, diff it against a checked-in snapshot or structurally compare specific fields against the hand-written `types/*.ts`, fail on mismatch. |
| **Failure mode when contract changes** | Impossible to silently drift: if a Pydantic field changes and nobody regenerates, the generated TS file is stale and the diff check fails immediately, pointing at the exact file to regenerate. Failure is mechanical, not a human judgment call. | Catches drift *after the fact* — a human still hand-edits `types/`, and the CI check only fires once someone remembers to run it (or a bot runs it and fails). More prone to "just make the check pass" edits that re-sync without actually re-reading the contract. |
| **Ergonomics for Python-strong/TS-lighter collaborator** | Strong win: they change a Pydantic model, run one generator command (or CI does it in a bot-commit step), and never hand-write TypeScript types. Matches DEC-1's premise that this person should own a coherent backend chunk without TS friction. | Weaker: they still need to hand-edit `types/*.ts` (or ask the other dev to) whenever a Python model changes, which is exactly the TS-authoring friction DEC-1 is trying to avoid. |
| **Setup cost** | Requires AC7 (FastAPI backend) to exist first. Then: wire FastAPI's built-in OpenAPI export, add `openapi-typescript` as a dev dependency, add a codegen npm script + CI step (~0.5-1 day once the backend exists). | Available today, independent of AC7. Needs a script that either (a) also requires a schema source to diff against (circular — still needs *something* generative, e.g. Pydantic/FastAPI, or a hand-maintained JSON Schema) or (b) if staying TS-only, a script that validates `types/*.ts` against the Zod schemas in `lib/api-types.ts` (e.g. `zod-to-ts` reverse-check, or simply deriving `types/` from Zod via `z.infer` and deleting the duplicate hand-written types). Low cost (~0.5 day) but only closes the *TS-internal* gap (Zod ↔ hand types), not a cross-language one. |
| **What it does NOT catch** | Nothing on the FE/BE seam if both sides are diligent about regenerating — the CI check is exactly what forces diligence. | Does not catch response-shape drift unless the "hand-written" side also gains response schemas (today it only has partial request schemas — see above). A drift check needs a source of truth to check *against*; without a generator, that source of truth is still manual. |

### 3. Recommendation (conditioned on AC7 go/no-go)

**If AC7 lands "go" (FastAPI backend ships):** use the **generated** path — Pydantic
models → FastAPI's built-in OpenAPI schema → `openapi-typescript` → committed
`types/` (or `types/generated/`), regenerated by a CI job that fails the build if the
regenerated output differs from what's committed (`git diff --exit-code` after
running the generator). This directly serves the epic's "frontend/backend contract
cannot drift silently" success metric with a mechanical (not human-judgment) check,
matches DEC-4's Pydantic recommendation, and minimizes TS-authoring burden for the
Python-strong collaborator. Ties into CR-002 as one more `web`-path or shared job in
the already-path-aware CI workflow (CR-002 AC5).

**If AC7 lands "no-go" (TS-only monolith persists):** adopt a **Zod-derived single
source of truth** inside the existing TS codebase rather than the current split
between hand-written `types/*.ts` and partially-applied `lib/api-types.ts` Zod
schemas:
- Extend `lib/api-types.ts` to define Zod schemas for **response** shapes too (today
  only requests are covered — see gap above), and derive the corresponding `types/*`
  exports via `z.infer<typeof xSchema>` instead of hand-duplicating the shape in
  `types/`. This removes the two-source-of-truth problem entirely (one Zod schema per
  shape; both the compile-time type and the runtime validator come from it) without
  waiting on a backend split.
- Add a lightweight CI check (or just rely on `tsc --noEmit` per CR-002 AC2) that
  fails if a `types/*.ts` file defines a shape that also has a same-named Zod schema
  in `lib/api-types.ts` but isn't derived via `z.infer` — this is a cheap lint rule,
  not a generator.
- Close the existing gap opportunistically: wire the three unused schemas
  (`joinLeagueSchema`, `makePickSchema`, `scoringResultSchema`) into their routes
  (notably `app/api/picks/route.ts` POST, which has no request validation today) as
  part of this work, since they're evidence the hand-written approach already drifts
  without a backend split.

Either branch is strictly better than the status quo (no response validation
anywhere, `ignoreBuildErrors: true`, no CI). The generated path is preferred *if* the
backend split happens because it removes hand-authored TS entirely for the
Python-strong collaborator; the Zod-derived path is the right fallback because it
reuses an already-installed dependency (`package.json:67`) and needs no new service
or generator toolchain.

### 4. Concrete CI step(s) (ties into CR-002)

**Generated path (AC7 = go):**
1. `api/` job (Python): run backend, export `openapi.json` (FastAPI does this via
   `app.openapi()` / `/openapi.json`) as a build artifact — or generate it headlessly
   via a script that imports the FastAPI app and dumps the schema, no server needed.
2. `web/` job (Node): run `openapi-typescript openapi.json -o types/generated/api.ts`
   (or similar path), then `git diff --exit-code -- types/generated/` — fail the job
   if regeneration produced a diff, meaning the committed types are stale relative to
   the Pydantic models.
3. Existing `tsc --noEmit` (CR-002 AC2) then runs against the freshly generated
   types, so a Pydantic-model change that breaks a frontend consumer fails both as a
   "stale generated file" error and, if someone force-commits, as a downstream type
   error.
4. Structure as a path-aware CI job per CR-002 AC5: trigger on changes under `api/**`
   (schema changed) or `types/generated/**` (consumer changed).

**Zod-derived fallback (AC7 = no-go):**
1. `tsc --noEmit` (already scoped in CR-002 AC2) enforces that `z.infer`-derived
   types match usage across `lib/api-client.ts` and `types/`.
2. Add an ESLint rule or small custom script run in CI that flags any `types/*.ts`
   export whose shape duplicates a `lib/api-types.ts` Zod schema without going
   through `z.infer` — prevents new hand-duplicated shapes from being introduced.
3. (Stretch, still TS-only) Add response-schema `.parse()` calls in API routes for
   the highest-risk endpoints (scoreboard, picks, season-summary) so the runtime
   catches a `lib/db.ts` shape drift (e.g. the `any`-typed aggregation results at
   `lib/db.ts:1744` and `lib/db.ts:1754-1755`) even without a language-boundary
   generator.

## AC3 (addendum) — Contract coverage under a pilot-only "go"

Scenario per CR-101-FINDINGS-B §4 / "Recommended phased path": only `lib/scoring.ts`
and `lib/game-updater.ts` port to a small Python/FastAPI service; the two cron jobs
repoint from `app/api/admin/recompute-scores` and `app/api/admin/update-game-scores`
to it; the other ~22 Next.js API routes, `lib/db.ts` (minus the scoring writers),
`lib/game-utils.ts`, and the whole frontend stay in Next.js/TS untouched.

**Direct answer:** Yes — uncontracted API calls would remain, and in fact the pilot
contracts almost none of the frontend-facing surface. All **34 of 34** functions in
`lib/api-client.ts` and all **23 of 23** exported types across the 9 files in `types/`
remain governed only by the status-quo mechanism CR-101-FINDINGS-C §1 already
documents (hand-written `types/`, 9 request-only Zod schemas of which only 6 are
wired up, zero response validation, `any`-typed DB aggregation results, no CI). The
pilot's Pydantic models would cover exactly 2 endpoints
(`POST /api/admin/recompute-scores`, `POST /api/admin/update-game-scores` →
Python-hosted equivalents) that no `api-client.ts` function ever calls — they are
invoked only by the ops scripts/cron (`scripts/calculate-scores.js`,
`scripts/update-game-scores.js`) via `X-API-Key`, not by the browser. Beyond the HTTP
seam, the pilot also opens a **second, entirely uncontracted surface that
Pydantic-on-FastAPI-endpoints does not touch at all**: the Python writer and the
Next.js reader would share MongoDB documents directly (no HTTP in between), and 13
distinct fields across 3 collections (`picks`, `league_memberships`, `games`, plus
3 more on `leagues`) cross that seam today with no schema check on either side.

### Table 1 — HTTP API coverage

**1a. `lib/api-client.ts` (34/34 functions, 0 contracted by the pilot)**

| Function (`lib/api-client.ts:line`) | Route called | Contracted by pilot? |
|---|---|---|
| `loginUser` (38) | `POST /auth/login` | No |
| `registerUser` (45) | `POST /auth/register` | No |
| `logoutUser` (62) | `POST /auth/logout` | No |
| `verifyUser` (68) | `GET /auth/verify` | No |
| `getAllLeagues` (73) | `GET /leagues` | No |
| `createLeague` (77) | `POST /leagues` | No |
| `getLeague` (98) | `GET /leagues/:id` | No |
| `getUserLeagues` (102) | `GET /users/:userId/leagues` | No |
| `getLeagueMembers` (106) | `GET /leagues/:leagueId/members` | No |
| `getScoreboard` (110) | `GET /leagues/:leagueId/scoreboard` | No |
| `getLeagueResults` (117) | `GET /leagues/:leagueId/results` | No |
| `getProfile` (132) | `GET /users/:userId` | No |
| `updateUserProfile` (136) | `PATCH /users/:userId` | No |
| `requestToJoinLeague` (146) | not implemented (throws) | No |
| `getLeagueMember` (155) | `GET /leagues/:leagueId/members/:memberId` | No |
| `updateMemberStatus` (159) | `PATCH /leagues/:leagueId/members/:memberId` | No |
| `removeMemberFromLeague` (170) | `DELETE /leagues/:leagueId/members/:memberId` | No |
| `getJoinRequests` (176) | stub, returns `[]` | No |
| `approveJoinRequest` (182) | not implemented (throws) | No |
| `rejectJoinRequest` (186) | not implemented (throws) | No |
| `updateLeagueSettings` (190) | `PATCH /leagues/:leagueId` | No |
| `getUserPicks` (208) | `GET /picks` | No |
| `getPicksRemaining` (212) | `GET /picks/remaining` | No |
| `getUpcomingGames` (219) | `GET /games` | No |
| `getUpcomingGamesWithPicks` (223) | `GET /games` | No |
| `makePick` (227) | `POST /picks` | No |
| `getPlayerProfile` (263) | not implemented (throws) | No |
| `getSeasonSummary` (267) | `GET /leagues/:leagueId/season-summary` | No |
| `createLeagueInvitation` (272) | `POST /leagues/:leagueId/invitations` | No |
| `getLeagueInvitations` (283) | `GET /leagues/:leagueId/invitations` | No |
| `getInvitationByToken` (287) | `GET /invite/:token` | No |
| `acceptInvitation` (291) | `POST /invite/:token/accept` | No |
| `revokeInvitation` (298) | `DELETE /invitations/:invitationId` | No |
| `generatePasswordResetLink` (305) | `POST /admin/users/:userId/generate-reset-link` | No |

The 2 pilot-facing routes (`app/api/admin/recompute-scores/route.ts:37`,
`app/api/admin/update-game-scores/route.ts:36`) have **zero** `api-client.ts`
callers — confirmed by grep, they are only reached via the API-key cron scripts
(`scripts/calculate-scores.js`, `scripts/update-game-scores.js`, per
CR-101-FINDINGS-B §4). Their request bodies are empty and their response shapes
(`ScoringResult` — `lib/scoring.ts:186-191` — and the `updateGameScores` return type —
`lib/game-updater.ts:453-462`) are ops/execution-summary objects that do not
correspond to any object in `types/`, so contracting them with Pydantic adds no
coverage for the FE-facing surface even incidentally.

**1b. `types/` objects (9 files, 23 exported types, 0 contracted by the pilot)**

| File | Exported types | Contracted by pilot? |
|---|---|---|
| `types/game.ts:4,6-25` | `GameStatus`, `Game` | No |
| `types/invitation.ts:1,15,30,38` | `LeagueInvitation`, `InvitationWithLeague`, `CreateInvitationRequest`, `InvitationAcceptanceInfo` | No |
| `types/league.ts:1-18,20-35,37-49,51-56` | `League`, `LeagueMembership`, `JoinRequest`, `SportsLeagueOption` | No |
| `types/password-reset.ts:1-11,13-27,29-32,34-49,51-54` | `PasswordResetToken`, `PasswordResetTokenWithUser`, `CreatePasswordResetRequest`, `PasswordResetValidationInfo`, `CompletePasswordResetRequest` | No |
| `types/pick.ts:4-9` | `Pick` | No |
| `types/player.ts:1-8` | `Player` | No |
| `types/season-summary.ts:1,3-10,12-19,21-25` | `PrizeType`, `PrizeWinner`, `FinalStanding`, `SeasonSummary` | No |
| `types/team.ts:1-5` | `Team` | No |
| `types/user.ts:3-7` | `User` | No |

**Quantified:** 34/34 `api-client.ts` functions and 23/23 `types/` exports remain
uncontracted by the pilot — **100%** of the FE-facing HTTP contract is untouched.
The pilot contracts 2 admin endpoints that sit entirely outside this surface.

### Table 2 — Shared-Mongo field contract (pilot writer ↔ Next.js reader, no HTTP)

13 fields across 4 collections cross this seam once `lib/scoring.ts` and
`lib/game-updater.ts` become a separate Python process writing directly to the same
MongoDB the Next.js reads from.

| Collection | Field | Written by | Read by (Next.js/TS) | Typed where today |
|---|---|---|---|---|
| `picks` | `result` | `lib/scoring.ts:67` (set `win`/`draw`/`loss`); reset to `null` on score correction at `lib/game-updater.ts:265` | `lib/db.ts:1161` (`getGamesByWeekWithPicks`); `lib/db.ts:1652,1672` (`getLeagueResults`); `lib/db.ts:1773-1780` (`getSeasonSummary`) | `types/pick.ts:7` — `"win" \| "loss" \| null` **(missing `"draw"` — pre-existing drift; contrast `types/game.ts:22` `userPick.result`, which does include `"draw"`)** |
| `league_memberships` | `points` | `lib/scoring.ts:156` | `lib/db.ts:481` (surface via `getLeagueMembersWithUserData`), `:1223,1287` (`getScoreboardWithPicks`), `:1800` (`getSeasonSummary`) | `types/league.ts:23` (`LeagueMembership.points`), `types/player.ts:4` |
| `league_memberships` | `strikes` | `lib/scoring.ts:157` | `lib/db.ts:482`, `:1224,1288`, `:1729,1802` | `types/league.ts:24`, `types/player.ts:5` |
| `league_memberships` | `lossStrikes` | `lib/scoring.ts:158` | `lib/db.ts:483` (surfaced by `getLeagueMembersWithUserData` only — **not** consumed further by `getScoreboardWithPicks`/`getLeagueResults`/`getSeasonSummary`, so no FE-visible drift risk today, but the field exists on the seam) | `types/league.ts:27` (optional) |
| `league_memberships` | `missingPickStrikes` | `lib/scoring.ts:159` | `lib/db.ts:484` (same — surfaced, not consumed downstream) | `types/league.ts:28` (optional) |
| `games` | `status` | `lib/game-updater.ts:280` | `lib/db.ts:1148` (`getGamesByWeekWithPicks`); also read internally by `lib/scoring.ts:13` (both move to Python together, so that particular read is not a new cross-language seam) | `types/game.ts:19` (`GameStatus`) |
| `games` | `homeScore` / `awayScore` | `lib/game-updater.ts:283-284` | `lib/db.ts:1146-1147`; internally by `lib/scoring.ts:13,18-19` | `types/game.ts:14-15` |
| `games` | `startTime` / `date` | `lib/game-updater.ts:281-282` | `lib/db.ts:1149` (`date`, `getGamesByWeekWithPicks`); `lib/db.ts:961,1043` (`getGameTimeInfoById`); **`lib/game-utils.ts:39,129`** — feeds `computeGameStatus`/`canChangeExistingPick`, i.e. TS-side pick-lock and UI status logic | `types/game.ts:15-16` |
| `games` | `externalId` | `lib/game-updater.ts:285` | Read only by `lib/game-updater.ts` itself (`:67,215,508`) — Python-internal, never reaches `lib/db.ts` or the frontend | Not typed anywhere in `types/` |
| `games` | `lastUpdated` | `lib/game-updater.ts:286` | No reader found outside the write site — audit-only field | Not typed anywhere in `types/` |
| `leagues` | `current_game_week` | `lib/game-updater.ts:432` | `lib/db.ts:1206` (`getScoreboardWithPicks`); **`lib/game-utils.ts:186`** (`hasGameweekStarted`, used by `app/api/picks/route.ts` for pick-locking authorization); `app/scoreboard/page.tsx:92,115` (direct frontend read) | `types/league.ts:15` |
| `leagues` | `current_pick_week` | `lib/game-updater.ts:433` | **`lib/game-utils.ts:185`** (`hasGameweekStarted`); `app/make-picks/page.tsx:45`; `app/scoreboard/page.tsx:38,52,57,91` | `types/league.ts:16` |
| `leagues` | `last_completed_week` | `lib/game-updater.ts:434`; also read internally by `lib/scoring.ts:107` | `lib/db.ts:1603` (`getLeagueResults`); `lib/db.ts:1721` (`getSeasonSummary`) | `types/league.ts:17` |
| `leagues` | `lastWeekUpdate` | `lib/game-updater.ts:435` | No reader found outside the write site — audit-only field | Not typed anywhere in `types/` |

**Findings on this table (cited facts):**
- 10 of the 13 fields have a live Next.js reader; 3 (`externalId`, `lastUpdated` on
  `games`, `lastWeekUpdate` on `leagues`) are currently write-only/audit fields with no
  outside reader, so they carry no *drift* risk today but would move into a different
  process's exclusive custody under the pilot.
- The two highest-stakes fields are `current_game_week`/`current_pick_week`: they
  are consumed by `lib/game-utils.ts:hasGameweekStarted` (`lib/game-utils.ts:171-193`),
  which gates whether `app/api/picks/route.ts` allows a pick to be created or changed
  (`app/api/picks/route.ts:76-121` per CR-101-FINDINGS-B item 21). If the Python writer
  and the TS reader disagree on what these two integers mean (e.g. an off-by-one week,
  or a `null`-vs-`0` mismatch), the failure mode is not a crash — it's silently
  wrong pick-locking (picks accepted after a gameweek starts, or blocked when they
  shouldn't be), with no schema check anywhere to catch it.
- `types/pick.ts:7` already omits `"draw"` from `Pick.result` while `lib/scoring.ts:23`
  can write `"draw"` and `types/game.ts:22` (`userPick.result`) already types it
  correctly — this is a pre-existing hand-written-type drift on the exact field this
  addendum is about, independent of the pilot, and evidence that this seam already
  drifts without any language boundary at all.

**Assessment:** A Pydantic-on-FastAPI-endpoints contract (Table 1) validates the
request/response bodies of the 2 admin trigger calls. It says nothing about any of
the 13 fields in Table 2, because those fields never travel over the pilot's HTTP
endpoints — they are written directly to MongoDB by the Python process and read
directly from MongoDB by Next.js. This is the drift surface DEC-4's "frontend/backend
contract cannot drift silently" success metric would need to name explicitly if the
pilot goes ahead, or the epic's success metric would be satisfied on paper (an HTTP
contract exists) while the actual highest-blast-radius seam (shared writable state)
remains exactly as uncontracted as it is today.

### Implications for scoping the contract work

Three options, ranked by cost, with a recommendation:

1. **Contract only the pilot's 2 HTTP endpoints.** Cheapest (~0.5 day per the
   existing CI-step estimate in AC3 §4, scoped down to 2 endpoints). Leaves 100% of
   the FE-facing HTTP surface (34 `api-client.ts` functions, 23 `types/` objects) and
   100% of the shared-Mongo seam (13 fields) uncontracted. Satisfies "the pilot's new
   service has a contract" but not the epic's drift-cannot-happen-silently metric for
   anything a user-facing page actually touches.
2. **Also add Pydantic models validating the shared-Mongo documents the pilot
   writes/reads.** Medium cost — this is not an HTTP contract, so it can't reuse
   FastAPI's OpenAPI export; it means hand-defining Pydantic models for the 13 fields
   in Table 2 (or a subset: at minimum `picks.result`, `league_memberships.points`/
   `strikes`, and `leagues.current_game_week`/`current_pick_week`/`last_completed_week`,
   since those are the fields with live TS readers) and either (a) validating on write
   in Python only — half the seam, or (b) also adding a matching Zod/TS check on read
   in `lib/db.ts` derived from the same field list, kept in sync by hand or by a small
   shared JSON-Schema-like spec. Closes the real drift risk identified above (the
   `current_game_week`/`current_pick_week` pick-locking path) at a cost proportional to
   13 fields, not 24 routes.
3. **Contract everything up front, including all ~22 remaining FE routes.** Largest —
   effectively pulls forward the "if AC7 lands go" generated-path recommendation from
   AC3 §3 before AC7 is decided, requiring Pydantic/OpenAPI-shaped definitions for
   routes that are explicitly staying in Next.js/TS under this pilot (no FastAPI
   backend exists for them to hang off of), so it would have to fall back to the
   Zod-derived TS-only path from AC3 §3 for those 22 routes — a second, parallel
   contract effort with a different mechanism than the pilot's Pydantic one.

**Recommendation: option (ii).** Option (i) is cheap but contracts a seam
(2 low-traffic admin endpoints) that was never the drift risk — the pilot doesn't
touch the 34-function/23-type FE surface at all, and Table 1 shows there's nothing
there for the pilot to accidentally decontract either. Option (iii) front-loads the
full AC7 "go" migration-surface decision (CR-101-FINDINGS-B) into a scope this ticket
brief defines as read-only research, and duplicates effort if AC7 later goes a
different direction. Option (ii) directly targets the surface this addendum shows is
the pilot's actual new risk: a same-database, two-language writer/reader pair with no
schema check today, concentrated on a small, enumerable field list (13 fields, 3 of
which are audit-only and could be dropped from scope, leaving 10 with real readers).
This is an assessment of contract-scoping cost versus risk, not the pilot go/no-go
decision itself — that remains the team's call per AC7.
