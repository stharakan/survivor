# CR-105 — Full-Migration Function & Contract Audit: Findings

Read-only spike. No Pydantic model or Python code written. `CR-101-FINDINGS*.md` was
not modified — see the flag below instead.

**Scope basis**: per the ticket's expanded context, this audit assumes the *full*
migration — build the complete Python backend, run it in parallel with the existing
Next.js/TS backend, validate parity, then **deprecate the TS backend entirely**. Under
that assumption, Next.js keeps only the browser-rendered frontend (`page.tsx` /
client components) plus whatever pure UI logic must stay client-side; it no longer
hosts any `app/api/*` route as a long-term destination. That is the single biggest
driver of the reclassifications below: almost every `STAYS-IN-NEXTJS` verdict in
`CR-101-FINDINGS-B.md` was conditioned on Next.js retaining the interactive/session
backend in a pilot scope. That condition no longer holds.

## Flag: `CR-101-FINDINGS.md` AC7 write-back needed

`CR-101-FINDINGS.md`'s AC7 section (lines 163–174) records the decision inline
(go / read-endpoint pilot / contract option iii) but the surrounding prose (lines
1–3, 16–23, and the "Research author's assessment" at 176–183) still describes a
**narrower pilot** as the open question. Per this ticket's own context section, the
decision was **further expanded in follow-up discussion** to a full-migration build
with deprecation of the TS backend — a scope beyond what AC7's recorded answer
("read endpoint" pilot, contract option iii) explicitly says. `CR-101-FINDINGS.md`
should be updated to state the full-migration scope as the current decision before
anyone reads AC7's answer as the ceiling of what's planned. **Not fixed here** —
flagged only, per this ticket's read-only brief.

---

## Table 1 — Port list

Every `lib/db.ts` / `lib/scoring.ts` / `lib/game-updater.ts` exported function and
every `app/api/**/route.ts` handler, full-migration verdict, citation, and
dependency-order rank. Rank order reuses `CR-101-FINDINGS-B.md`'s "Grouped effort
estimate" dependency chain (scope item 5): **1 auth → 2 leagues → 3 memberships →
4 games → 5 picks → 6 invitations → 7 scoring/results**. Nothing surfaced in this
audit motivates reordering that chain.

**Headline: with the pilot scope gone, 24 of 24 routes and 33 of 36 `lib/db.ts`
functions flip to `MOVE-TO-PYTHON`.** The only routes/functions that do *not* simply
flip are the 3 dead/stub `lib/db.ts` functions (Table 3, cut list) and 1 dev-tooling
function (`initializeDefaultData`, kept in Next.js — reasoned below, not a silent
holdover). The previous `STAYS-IN-NEXTJS` verdicts on the 11 JWT/cookie-gated routes
held only because the pilot kept Next.js as the session/auth layer; per this ticket's
out-of-scope note, the auth-boundary design is **already decided** — "direct JWT
verification in FastAPI for browser routes" — which settles that question in favor of
Python for all of them. Cookie issuance is not actually Next.js-specific (FastAPI can
set `Set-Cookie` headers identically); the ticket brief's own carve-out for cookie
issuance was conditioned on "the frontend staying on Next.js **as a static/client
shell** [that issues its own cookies]" — that is not this ticket's assumption (the
decided auth boundary has FastAPI verifying JWTs directly for the browser, i.e., no
BFF proxy), so the carve-out does not apply here.

### Rank 1 — Auth (users, credentials, sessions)

| # | Item | file:line | Verdict | Reason / flip note |
|---|------|-----------|---------|---------------------|
| 1.1 | `createUser` | `lib/db.ts:15` | MOVE-TO-PYTHON | unchanged verdict-shape, just no longer gated to Next by anything |
| 1.2 | `getUserByEmail` | `lib/db.ts:31` | MOVE-TO-PYTHON | — |
| 1.3 | `getUserById` | `lib/db.ts:44` | MOVE-TO-PYTHON | — |
| 1.4 | `verifyPassword` | `lib/db.ts:57` | MOVE-TO-PYTHON | — |
| 1.5 | `updateUser` | `lib/db.ts:73` | MOVE-TO-PYTHON | — |
| 1.6 | `POST /api/auth/login` | `app/api/auth/login/route.ts:6-40` | **MOVE-TO-PYTHON (flip)** | was STAYS ("issues JWT, sets HTTP-only cookie," `CR-101-FINDINGS-B.md` #4) — flip because the auth-boundary decision already puts JWT verification (and by the same logic, issuance) in FastAPI for browser routes |
| 1.7 | `POST /api/auth/logout` | `app/api/auth/logout/route.ts:1-20` | **MOVE-TO-PYTHON (flip)** | was STAYS (#5) — trivial cookie-clear, no Next-specific dependency once Next isn't the session issuer |
| 1.8 | `POST /api/auth/register` | `app/api/auth/register/route.ts:1-45` | **MOVE-TO-PYTHON (flip)** | was STAYS (#6) — same reasoning as login |
| 1.9 | `GET /api/auth/verify` | `app/api/auth/verify/route.ts:1-38` | **MOVE-TO-PYTHON (flip)** | was STAYS (#7) — JWT verify itself is now a FastAPI-side operation by the decided auth boundary |
| 1.10 | `GET/PATCH /api/users/[userId]` | `app/api/users/[userId]/route.ts:7-27` (GET, no auth today), `:41,50` (PATCH, JWT+self-check) | **MOVE-TO-PYTHON (flip, both methods together)** | was SPLIT/UNCLEAR (#24, GET/PATCH in different buckets) — full migration removes the reason to split a single file across two backends; **note the pre-existing GET-has-no-auth gap does not get fixed by the move alone — port it as a bug to fix, not to replicate** |
| 1.11 | `GET /api/users/[userId]/leagues` | `app/api/users/[userId]/leagues/route.ts:6-14` | **MOVE-TO-PYTHON (flip)** | was SPLIT/UNCLEAR (#23) — same no-ownership-check gap noted for 1.10, carries over as a bug to fix during the port, not a reason to keep it in Next |
| 1.12 | `POST /api/admin/users/[userId]/generate-reset-link` | `app/api/admin/users/[userId]/generate-reset-link/route.ts:29` (verify), `:51-67` (admin authz), `:88-117` (token issuance) | **MOVE-TO-PYTHON (flip)** | was STAYS (#3, "heaviest" auth-adjacent case) — FastAPI can run the same admin-authz check and token-write with `crypto`/`secrets` equivalents |
| 1.13 | `GET/POST /api/reset-password/[token]` | `app/api/reset-password/[token]/route.ts:24` (GET), `:111` (POST), `:168` (bcrypt hash) | **MOVE-TO-PYTHON (flip)** | was STAYS (#22, "credential-management surface") — bcrypt (`passlib`/`bcrypt` in Python) and audit-log writes are not Next-specific |

### Rank 2 — Leagues

| # | Item | file:line | Verdict | Reason / flip note |
|---|------|-----------|---------|---------------------|
| 2.1 | `createLeague` | `lib/db.ts:97` | MOVE-TO-PYTHON | — |
| 2.2 | `getLeagueById` | `lib/db.ts:141` | MOVE-TO-PYTHON | — |
| 2.3 | `updateLeagueSettings` | `lib/db.ts:166` | MOVE-TO-PYTHON | — |
| 2.4 | `getAllLeagues` | `lib/db.ts:216` | MOVE-TO-PYTHON | — |
| 2.5 | `getAvailableLeagues` | `lib/db.ts:239` | MOVE-TO-PYTHON | — |
| 2.6 | `GET/POST /api/leagues` | `app/api/leagues/route.ts:10-20` (GET), `:42-52` (POST) | **MOVE-TO-PYTHON (flip)** | was STAYS (#19, "inline cookie/JWT check") |
| 2.7 | `GET/PATCH /api/leagues/[leagueId]` | `app/api/leagues/[leagueId]/route.ts:19` (GET, `verifyLeagueMembership`), `:53-62` (PATCH, JWT) | **MOVE-TO-PYTHON (flip)** | was STAYS (#16) |
| 2.8 | `DELETE /api/leagues/[leagueId]` | `app/api/leagues/[leagueId]/route.ts:116-127` | **See Table 3 (cut list)** | unimplemented (501); disposition (build-for-real vs. drop) decides whether this becomes a Rank-2 MOVE item or is dropped entirely |

### Rank 3 — Memberships

| # | Item | file:line | Verdict | Reason / flip note |
|---|------|-----------|---------|---------------------|
| 3.1 | `createLeagueMembership` | `lib/db.ts:294` | MOVE-TO-PYTHON | — |
| 3.2 | `getUserLeagueMemberships` | `lib/db.ts:340` | MOVE-TO-PYTHON | — |
| 3.3 | `getLeagueMembers` | `lib/db.ts:389` | MOVE-TO-PYTHON | — |
| 3.4 | `getLeagueMembersWithUserData` | `lib/db.ts:438` | MOVE-TO-PYTHON | — |
| 3.5 | `getLeagueMember` | `lib/db.ts:499` | MOVE-TO-PYTHON | — |
| 3.6 | `updateMemberStatus` | `lib/db.ts:558` | MOVE-TO-PYTHON | — |
| 3.7 | `removeMemberFromLeague` | `lib/db.ts:601` | MOVE-TO-PYTHON | — |
| 3.8 | `GET /api/leagues/[leagueId]/members` | `app/api/leagues/[leagueId]/members/route.ts:17` (`verifyLeagueMembership`) | **MOVE-TO-PYTHON (flip)** | was STAYS (#14) |
| 3.9 | `GET/PATCH/DELETE /api/leagues/[leagueId]/members/[memberId]` | `app/api/leagues/[leagueId]/members/[memberId]/route.ts:26-33` (GET), `:73-88` (PATCH authz), `:144-166` (DELETE authz), `:189-213` (audit log) | **MOVE-TO-PYTHON (flip)** | was STAYS (#13, "heaviest auth file in the surface") — `authorizeRequest`/`validateAdminPermission` (`lib/auth-utils.ts`) port alongside it as the same Rank-3 chunk |

### Rank 4 — Games

| # | Item | file:line | Verdict | Reason / flip note |
|---|------|-----------|---------|---------------------|
| 4.1 | `getGamesByWeek` | `lib/db.ts:707` | MOVE-TO-PYTHON | — |
| 4.2 | `getGameTimeInfoById` | `lib/db.ts:950` | MOVE-TO-PYTHON | consumed by `app/api/picks/route.ts` pick-lock validation (Rank 5) — port together |
| 4.3 | `getAllTeams` | `lib/db.ts:1059` | MOVE-TO-PYTHON | — |
| 4.4 | `getGamesByWeekWithPicks` | `lib/db.ts:1072` | MOVE-TO-PYTHON | was SPLIT/UNCLEAR read-fn under the pilot; firm MOVE now |
| 4.5 | `createGame` | `lib/db.ts:646` | **See Table 3 (cut list)** | zero importers from any live route — confirmed unchanged on re-grep |
| 4.6 | `createGameIndexes` | `lib/db.ts:1176` | **See Table 3 (cut list)** | same |
| 4.7 | `GET /api/games` | `app/api/games/route.ts:5-26` | **MOVE-TO-PYTHON (firm, was SPLIT/UNCLEAR)** | #8 in prior table — no in-route auth at all (middleware-only); resolving the split doesn't fix that gap, it just relocates it — flag as a bug to fix during the port |

### Rank 5 — Picks

| # | Item | file:line | Verdict | Reason / flip note |
|---|------|-----------|---------|---------------------|
| 5.1 | `createPick` | `lib/db.ts:762` | MOVE-TO-PYTHON | was STAYS under the pilot specifically because moving it cross-service would add a network hop to every pick submission "for no domain-logic benefit" (`CR-101-FINDINGS-B.md` §2) — that reasoning assumed Next.js *kept* the interactive backend as the frontend's origin. Under full migration the frontend calls Python directly for everything else too, so there is no longer a comparison point where staying in Next avoids a hop — it just relocates which service the browser hits first. **See also Table 4**: this function's own result-computation logic has a bug independent of migration (does not handle `"draw"`) that should be fixed during the port, not carried forward. |
| 5.2 | `getUserPicksByLeague` | `lib/db.ts:872` | MOVE-TO-PYTHON | — |
| 5.3 | `getUserPickForWeek` | `lib/db.ts:968` | MOVE-TO-PYTHON | — |
| 5.4 | `GET/POST /api/picks` | `app/api/picks/route.ts:10-18` (no auth), `:63-122` (pick-lock logic) | **MOVE-TO-PYTHON (firm, was SPLIT/UNCLEAR)** | #21 — carries the missing-auth gap forward as a bug to fix, and carries the `lib/game-utils.ts` server-validation dependency forward as the Table 2 duplicate-list item |
| 5.5 | `GET /api/picks/remaining` | `app/api/picks/remaining/route.ts:6-17` | **MOVE-TO-PYTHON (firm, was SPLIT/UNCLEAR)** | #20 — same trust-the-query-param gap noted in prior findings, unresolved by the move |

### Rank 6 — Invitations

| # | Item | file:line | Verdict | Reason / flip note |
|---|------|-----------|---------|---------------------|
| 6.1 | `createLeagueInvitation` | `lib/db.ts:1346` | MOVE-TO-PYTHON | — |
| 6.2 | `getLeagueInvitations` | `lib/db.ts:1381` | MOVE-TO-PYTHON | — |
| 6.3 | `getInvitationByToken` | `lib/db.ts:1433` | MOVE-TO-PYTHON | — |
| 6.4 | `acceptInvitation` | `lib/db.ts:1489` | MOVE-TO-PYTHON | — |
| 6.5 | `revokeInvitation` | `lib/db.ts:1541` | MOVE-TO-PYTHON | — |
| 6.6 | `createInvitationIndexes` | `lib/db.ts:1557` | **See Table 3 (cut list) — new finding, not in prior audits** | same "no live-route importer" profile as `createGameIndexes`; only ever called from `initializeDefaultData` (`lib/db.ts:1308`), itself only reachable via `scripts/init-db.ts:101` |
| 6.7 | `DELETE /api/invitations/[invitationId]` | `app/api/invitations/[invitationId]/route.ts:15-29` | **MOVE-TO-PYTHON (flip)** | was STAYS (#9) — note the code comment admitting authorization is incomplete ("any authenticated user for now") travels with the port as a known gap, not fixed by relocation alone |
| 6.8 | `POST /api/invite/[token]/accept` | `app/api/invite/[token]/accept/route.ts:15-25` | **MOVE-TO-PYTHON (flip)** | was STAYS (#10) |
| 6.9 | `GET /api/invite/[token]` | `app/api/invite/[token]/route.ts:5-13` | **MOVE-TO-PYTHON (flip)** | was STAYS (#11, "intentionally public... not worth splitting out on its own") — under a pilot that logic argued for keeping a tiny public route next to its STAYS siblings; under full migration its siblings (6.7, 6.8, 6.10) all move too, so there's no longer a STAYS cluster for it to shelter next to |
| 6.10 | `GET/POST /api/leagues/[leagueId]/invitations` | `app/api/leagues/[leagueId]/invitations/route.ts:17-27`, `:60-70` | **MOVE-TO-PYTHON (flip)** | was STAYS (#12) |

### Rank 7 — Scoring / results

| # | Item | file:line | Verdict | Reason / flip note |
|---|------|-----------|---------|---------------------|
| 7.1 | `updatePickResults` | `lib/scoring.ts:35` | MOVE-TO-PYTHON | unchanged — already MOVE under the pilot |
| 7.2 | `calculateScoresAndStrikes` | `lib/scoring.ts:88` | MOVE-TO-PYTHON | unchanged |
| 7.3 | `runScoringCalculation` | `lib/scoring.ts:194` | MOVE-TO-PYTHON | unchanged |
| 7.4 | `updateGameScores` | `lib/game-updater.ts:453` | MOVE-TO-PYTHON | unchanged; internal helpers (`mapApiStatusToInternal`, `findGameInBulkResponse`, `updateLeagueWeekTracking`, etc.) move with it, not listed separately — none are exported or called from anywhere but this file |
| 7.5 | `getScoreboardWithPicks` | `lib/db.ts:1195` | **MOVE-TO-PYTHON (flip, was SPLIT read-only)** | was "read stays, write moves" (#17 pairing) — under full migration there's no reason to keep the read half in a deprecated backend |
| 7.6 | `getLeagueResults` | `lib/db.ts:1595` | **MOVE-TO-PYTHON (flip)** | same as 7.5, paired with route #15 |
| 7.7 | `getSeasonSummary` | `lib/db.ts:1709` | **MOVE-TO-PYTHON (flip)** | same, paired with route #18 |
| 7.8 | `GET /api/admin/recompute-scores` | `app/api/admin/recompute-scores/route.ts:9-22,37-51` | MOVE-TO-PYTHON | unchanged — API-key trigger, already the pilot's own scope |
| 7.9 | `GET /api/admin/update-game-scores` | `app/api/admin/update-game-scores/route.ts:8-21,36-50` | MOVE-TO-PYTHON | unchanged |
| 7.10 | `GET /api/leagues/[leagueId]/results` | `app/api/leagues/[leagueId]/results/route.ts:16,26` | **MOVE-TO-PYTHON (firm, was SPLIT/UNCLEAR)** | #15 |
| 7.11 | `GET /api/leagues/[leagueId]/scoreboard` | `app/api/leagues/[leagueId]/scoreboard/route.ts:16,26` | **MOVE-TO-PYTHON (firm, was SPLIT/UNCLEAR)** | #17 |
| 7.12 | `GET /api/leagues/[leagueId]/season-summary` | `app/api/leagues/[leagueId]/season-summary/route.ts:16,26` | **MOVE-TO-PYTHON (firm, was SPLIT/UNCLEAR)** | #18 |

### Not ranked — dev tooling exception

| Item | file:line | Verdict | Reason |
|---|---|---|---|
| `initializeDefaultData` | `lib/db.ts:1303` | **STAYS-IN-NEXTJS (not flipped)** | Sole caller is `scripts/init-db.ts:101`, a one-off Node/TS dev-seeding script that talks to MongoDB directly and never calls the HTTP API — it is not part of the live request path this migration is deprecating (`CR-101-FINDINGS-B.md` §4 explicitly places all such scripts, other than the two cron HTTP clients and `update-games.ts`, out of the migration's critical path, and this ticket's scope items did not reopen that call). Porting a seed script to Python buys nothing until/unless the team also decides to retire `scripts/init-db.ts`, which is a separate decision this audit does not make. Flagged explicitly rather than silently omitted, per the agent brief. |

**Total**: 24/24 routes MOVE-TO-PYTHON (1 pending cut-list disposition), 33/36
`lib/db.ts` functions MOVE-TO-PYTHON, 3/36 in the cut list, 1/36 (`initializeDefaultData`)
kept in Next.js by exception, all of `lib/scoring.ts` (3/3) and `lib/game-updater.ts`
(1/1 exported) MOVE-TO-PYTHON.

---

## Table 2 — Duplicate list

Scope item 2 asked to re-grep for any `lib/`/`app/` file imported by both a
`page.tsx`/client component **and** an `app/api/*` route, beyond the known
`lib/game-utils.ts` case. Re-run against current `main` (script-based, exact
`@/lib/<name>["']` import matching to avoid substring false positives — an initial
naive substring grep flagged `lib/api.ts` spuriously; it turned out to be a 5-line
re-export shim (`lib/api.ts:1-5`, `export * from './api-client'`) with zero actual
importers in `app/api/*` once matched exactly, so it is not a duplicate-logic case).

**Confirmed: `lib/game-utils.ts` is still the only file in this category.**

| Function | Where it's duplicated from | Server-side consumer | Client-side consumer(s) | Why it can't move wholesale | Sync owner |
|---|---|---|---|---|---|
| `computeGameStatus` | `lib/game-utils.ts:20-57` | Transitive dependency of `canPickFromGame` (below) — used for server-side pick-lock validation | `app/make-picks/page.tsx`, `app/scoreboard/page.tsx` (via `getGameCardClasses`, `isGameDisabled`, `getTeamSelectionClasses`, all of which call it) | Single source of truth for the "game is pickable" time-window rule (2.5-hour buffer). A Python port for server-side pick-locking and a TS original for UI rendering must independently reproduce the exact same time-window arithmetic. | Whoever owns `app/api/picks` server-side validation in Python (Rank 5, Table 1) — must diff against `lib/game-utils.ts:20-57` on every change to either side |
| `canPickFromGame` | `lib/game-utils.ts:63-65` | `app/api/picks/route.ts:5,108,116` | `app/make-picks/page.tsx` (indirectly, via game-card rendering) | Directly gates whether the POST /picks handler accepts a pick — this is real authorization logic, not just UI, so it needs an actual Python port, not just a "the UI matches" assumption | Same as above |
| `canChangeExistingPick` | `lib/game-utils.ts:122-137` | `app/api/picks/route.ts:5,97` | `app/make-picks/page.tsx` (pick-change UI state) | Gates whether an existing pick can be overwritten server-side; has its own (simpler, no-buffer) time comparison independent of `computeGameStatus` — a second, separate piece of time logic that must also be kept in sync | Same |
| `hasGameweekStarted` | `lib/game-utils.ts:178-195` | `app/api/picks/route.ts:5,76` | `app/make-picks/page.tsx:45`, `app/scoreboard/page.tsx:38,52,57,91` | Consumes `league.current_game_week`/`current_pick_week` — the same two fields flagged in `CR-101-FINDINGS-C.md`'s addendum as the highest-blast-radius shared-Mongo seam (silent wrong pick-locking on a writer/reader disagreement). Once `lib/game-updater.ts` (the writer of these fields) is Python and this function (a reader) is dual-implemented in TS and Python, that risk is now realized on **both** sides of a real language boundary, not just a hypothetical one. | Same — and this is the single highest-priority pair to keep in sync, not just "a" risk among equals |
| `arePicksLocked` | `lib/game-utils.ts:201-203` | `app/api/picks/route.ts:5,77` | `app/make-picks/page.tsx` (implied via lock-state UI, through `shouldDisablePickChanges`) | Trivial boolean AND of the two functions above, but still executes the actual lock decision server-side | Same |
| `getGameStatusDisplay`, `isGameDisabled`, `getGameCardClasses`, `getTeamSelectionClasses`, `canMakeFirstPick`, `shouldDisablePickChanges` | `lib/game-utils.ts:70-91,96-99,104-116,142-168,209-211,217-219` | **None** — no `app/api/*` importer | `app/make-picks/page.tsx`, `app/scoreboard/page.tsx` | Pure UI rendering (badge labels, CSS classes, button-disabled state) — never touches the request path. **No Python port needed for these.** | N/A — stays TS-only, no duplication risk |

**Risk named explicitly (per scope item 2)**: 5 of 11 `lib/game-utils.ts` functions
(`computeGameStatus`, `canPickFromGame`, `canChangeExistingPick`, `hasGameweekStarted`,
`arePicksLocked`) must exist correctly in **both** languages with no shared test
suite or generated contract between them today. A drift here fails silently as wrong
pick-locking (picks accepted late or blocked early) — it will not throw, crash, or
show up in a type-checker, because both implementations independently compute a
boolean from primitive inputs. Recommend a same-fixture golden test (fixed set of
`{startTime, status, current_game_week, current_pick_week}` inputs → expected
booleans) run in both the TS and Python test suites as the actual sync mechanism,
not "keep them the same by eye."

**Additional finding (not itself a duplicate, but adjacent)**: `manualStatusOverride`,
referenced in `lib/game-utils.ts` (`:24,29-30,63,96,105,126,143`) as an optional input
field, is **never written anywhere** — not in `types/game.ts` (it isn't declared
there at all — it's an ad hoc inline type invented in `game-utils.ts`), not in
`lib/db.ts`'s Game-shaping functions (`lib/db.ts:683-704`, `:1131-1164`), not in
`lib/game-updater.ts`'s write site (`lib/game-updater.ts:276-289`). It is dead
optionality — confirmed via repo-wide grep, only `lib/game-utils.ts` itself
references the name. Flagging so it isn't accidentally carried into a Python model
as a real field; either wire up an admin path to set it, or drop it from the function
signatures during the port.

---

## Table 3 — Cut list

Re-ran the ticket's named greps (`not implemented`, stub `return []`, `TODO`) against
current `main`. All four originally-named cases are unchanged; **one additional case
surfaced** (`createInvitationIndexes`, not previously flagged in
`CR-101-FINDINGS-C.md` Table 1a or `CR-101-FINDINGS-B.md`'s dead-code note).

| # | Item | file:line | Status confirmed on current `main` | UI wiring (evidence for the decision) | Disposition |
|---|---|---|---|---|---|
| 1 | `createGame` | `lib/db.ts:646-705` | Zero importers under `app/api/**` (confirmed by grep); only caller is `scripts/init-db.ts:145,170,195,220` | None — dev-seed only | **Drop from the port.** `scripts/init-db.ts` keeps calling `lib/db.ts` directly (Node tooling, unaffected by the backend migration since it never goes through the HTTP API). Do not build a Python equivalent unless the team separately decides to also port dev-seeding, which is out of this ticket's scope. |
| 2 | `createGameIndexes` | `lib/db.ts:1176-1194` | Same — only called from `initializeDefaultData:1307` | None | **Drop**, same reasoning as #1 |
| 3 | `createInvitationIndexes` | `lib/db.ts:1557-1594` | **New finding this audit** — identical profile to #2: only called from `initializeDefaultData:1308`, itself only reachable from `scripts/init-db.ts:101` | None | **Drop**, same reasoning — should have been grouped with `createGameIndexes` in the original dead-code note; wasn't |
| 4 | `getPlayerProfile` | `lib/api-client.ts:263-264` (throws `'getPlayerProfile not implemented yet'`) | Unchanged | **Live**: `app/player/[id]/page.tsx:6,34` calls it directly in a `useEffect` on every page load — the player-profile page is currently broken/throws for every user | **Build-for-real recommended, not drop.** Unlike the DELETE-league case below, this isn't orphaned code the team forgot to remove — it's a page users can navigate to today that immediately errors. Dropping the feature means also removing/hiding the `app/player/[id]` route and its nav entry points; building it for real means implementing the missing `lib/db.ts` read function and wiring a real route. Either is a legitimate call, but "leave it throwing" is not — flag for an explicit decision, don't port the throw as-is. |
| 5 | `approveJoinRequest` | `lib/api-client.ts:182-184` | Unchanged | **Live**: `app/admin/requests/[id]/page.tsx:6,60` | **DECIDED: Drop (2026-08-06)** — see Addendum. User's own flow list has invites as the only registration path (admin-initiated), with no request-to-join step; two independent signals now agree. Remove UI entry points, do not port. |
| 6 | `rejectJoinRequest` | `lib/api-client.ts:186-188` | Unchanged | **Live**: `app/admin/requests/[id]/page.tsx:6,81` | **DECIDED: Drop (2026-08-06)** — same as #5 |
| 7 | `requestToJoinLeague` | `lib/api-client.ts:146-153` | Unchanged | **Live**: `app/leagues/page.tsx:6,58` — the "request to join" button on the leagues page throws on click | **DECIDED: Drop (2026-08-06)** — same as #5 |
| 8 | `getJoinRequests` | `lib/api-client.ts:176-180` (stub, always returns `[]`) | Unchanged | **Live**: `app/admin/page.tsx:7,119`, `app/admin/requests/[id]/page.tsx:6,33` — both admin screens silently show "no requests" regardless of actual state, since the stub always returns empty | **DECIDED: Drop (2026-08-06)** — same as #5 |
| 9 | `DELETE /api/leagues/[leagueId]` | `app/api/leagues/[leagueId]/route.ts:116-127` (returns 501, `// TODO: Implement league deletion logic`) | Unchanged | **None found** — grepped for any `lib/api-client.ts` function calling this DELETE method; there is no `deleteLeague` export at all, unlike items 4–8 above | **DECIDED: Drop (2026-08-06)** — not ported. Omit the route from the Python backend entirely rather than replicating the 501 stub. |

**Note on items 4–8 (superseded for 5–8, see Addendum)**: these five were one
connected feature (join-request workflow) sharing one disposition decision, not five
independent ones. **Items 5–8 (the join-request half) are now decided: drop**, per
the 2026-08-06 user-flow review below. Item 4 (`getPlayerProfile`, the public-profile
page) is a *separate* feature — not part of join-request — and remains
**build-for-real**, now with its own new model (see Table 4 Addendum).

---

## Table 4 — Pydantic model list

One row per `types/` export (9 files, 23 exports — unchanged count, re-confirmed by
listing `types/*.ts` on current `main`), diffed against its actual DB write site
rather than copied as-is, per scope item 4.

| Model (proposed) | Source `types/` file | Status | DB/computation ground-truth site | Notes |
|---|---|---|---|---|
| `GameStatus` | `types/game.ts:4` | Confirmed-accurate | `lib/game-updater.ts:80` (`mapApiStatusToInternal`), write at `:280` | Literal union `"not_started"\|"in_progress"\|"completed"` matches all observed values |
| `Game` | `types/game.ts:6-25` | **Drift-fixed** | `lib/db.ts:1131-1164` (`getGamesByWeekWithPicks`), `lib/game-updater.ts:276-289` (writer) | `userPick.result` already correctly includes `"draw"` in the hand-written type (`types/game.ts:22`) — no fix needed here, it's `Pick.result` (below) that's wrong. Minor: this read path never populates `startTime` (only `date`) even though the type allows it — harmless (optional field), not a drift, just an unused-in-this-path field; keep `Optional[str] = None` in the Pydantic model. |
| `Pick` | `types/pick.ts:4-9` | **Drift-fixed (2 issues, not 1)** | Ground truth is actually **two disagreeing write sites**, not one: | See below |
| | | | (a) `lib/scoring.ts:12-32,67` — `calculatePickResult` correctly returns `"win"\|"draw"\|"loss"\|null` and writes it via `$set: { result }` | This is the known drift from `CR-101-FINDINGS-C.md` Table 2: `types/pick.ts:7` declares `result: "win" \| "loss" \| null`, omitting `"draw"`, while this write site can produce `"draw"`. **Fix in the Pydantic model**: `result: Literal["win", "draw", "loss"] | None`. |
| | | | (b) `lib/db.ts:801-809` — `createPick`'s own inline result calculation (`let result: "win" \| "loss" \| null`, home-vs-away score comparison) **never checks for a tie** — if a pick is created against a game that is *already* completed and drawn, both the home-team picker and the away-team picker get `result = "loss"` (neither `>` comparison is true), not `"draw"`. | **New finding, beyond the known type-level drift.** This is a real scoring bug, not just a type-annotation gap: `updatePickResults` (`lib/scoring.ts:35-85`) only re-examines picks with `result: null` (`lib/scoring.ts:44`), so a pick mis-scored as `"loss"` by `createPick` at creation time is **never corrected** by the periodic scoring job — it's permanently wrong. Low-frequency edge case (only triggers when a user picks against a game that's already finished and drawn), but a genuine data-correctness bug. **Recommend fixing during the port**: make the Python port's pick-creation path call the same `calculatePickResult`-equivalent logic used by scoring, instead of re-implementing a narrower win/loss-only comparison. Do not port `lib/db.ts:801-809`'s logic as-is. |
| `Team` | `types/team.ts:1-5` | Confirmed-accurate | `lib/db.ts:1059-1069` (`getAllTeams`) | Straight passthrough, no drift |
| `User` | `types/user.ts:3-7` | Confirmed-accurate | `lib/db.ts:15-29` (`createUser`), `:73-94` (`updateUser`) | `leagues?: LeagueMembership[]` is correctly optional — never populated by `lib/db.ts` itself (assembled by callers), matches actual usage |
| `League` | `types/league.ts:1-18` | **Drift-fixed — new finding, more significant than the known `Pick.result` case** | `lib/db.ts:97-138` (`createLeague`), `:141-164` (`getLeagueById`), `:166-213` (`updateLeagueSettings`), `:216-238` (`getAllLeagues`) — all four cast `id: result.insertedId.toString()` and `createdBy: ....toString()` | **`types/league.ts:2` declares `id: number` and `:12` declares `createdBy: number`, but every write/read site produces `.toString()`'d MongoDB `ObjectId`s — actual runtime type is `string`, not `number`, for both fields.** Confirmed systemic, not a one-off: same pattern repeats in `getUserLeagueMemberships` (`lib/db.ts:360,368`) and everywhere else a `League` object is assembled. This is masked today only because `ignoreBuildErrors: true` (per CLAUDE.md) suppresses the type-checker catching the `as League` cast mismatch, and because JS doesn't enforce parameter types at runtime — `lib/api-client.ts` also declares `leagueId: number` throughout (e.g. `getLeague(leagueId: number)` at `lib/api-client.ts:98`, and 15+ more sites) while every caller actually passes a string. **Fix in the Pydantic model: `id: str`, `createdBy: str`.** This would be caught immediately by a real Pydantic model (validation error on the first request) — good evidence for doing the port rather than deferring the contract question, per this ticket's Table 1 rationale. |
| `LeagueMembership` | `types/league.ts:20-35` | Confirmed-accurate | `lib/db.ts:294-337` (`createLeagueMembership`), `:558-599` (`updateMemberStatus`) | `id: string` correctly matches `.toString()`; nested `league: League` correctly nests the (now-fixed) `League` model |
| `JoinRequest` | `types/league.ts:37-49` | **DROPPED (decided 2026-08-06)** | None — `getJoinRequests` (`lib/api-client.ts:176-180`) is a stub returning `[]`; no `lib/db.ts` function creates, reads, or writes a join-request document anywhere | No Pydantic model. Confirmed dead per Table 3 (no ground truth) *and* per the user's own registration flow (invites-only, no request-to-join step) — two independent signals. Feature dropped, not just deferred; see Addendum. |
| `SportsLeagueOption` | `types/league.ts:51-56` | **DROPPED (decided 2026-08-06)** | None — hardcoded static array, `app/admin/page.tsx:38` (`const sportsLeagueOptions: SportsLeagueOption[] = [...]`) | Was already excluded as a UI-only constant; now doubly moot — product direction is EPL-only, so the multi-sport picker it powers is being removed, not just left unmodeled. `League.sportsLeague: string` (`types/league.ts:5`) likely collapses to a fixed/default value rather than a user choice; confirm during Phase 1 whether to keep the field at all or drop it. |
| `LeagueInvitation` | `types/invitation.ts:1-11` | Confirmed-accurate | `lib/db.ts:1346-1379` (`createLeagueInvitation`) | Straight match |
| `InvitationWithLeague` | `types/invitation.ts:13-27` | Confirmed-accurate | `lib/db.ts:1381-1431` (`getLeagueInvitations`, not fully re-read line-by-line here but shape matches the invitation+league join pattern already validated in `LeagueInvitation`) | Lower confidence than others — recommend a spot-check during modeling, not re-verified field-by-field in this pass |
| `CreateInvitationRequest` | `types/invitation.ts:29-32` | Confirmed-accurate | Request-body shape consumed by `createLeagueInvitation`'s `maxUses`/`expiresAt` params (`lib/db.ts:1346-1350`) | Matches |
| `InvitationAcceptanceInfo` | `types/invitation.ts:34-49` | Not independently re-verified this pass | `lib/db.ts:1433-1487` (`getInvitationByToken`) | Recommend a spot-check during modeling (not read in full this pass; no drift signal found, but not exhaustively diffed either) |
| `PasswordResetToken` | `types/password-reset.ts:1-11` | Confirmed-accurate | `app/api/admin/users/[userId]/generate-reset-link/route.ts:98-108` (`passwordResetToken: Omit<PasswordResetToken, 'id'>` — explicitly typed against this exact model already) | Best-typed write site in the codebase — the route already type-checks its insert against the hand-written type via `Omit<>` |
| `PasswordResetTokenWithUser` | `types/password-reset.ts:13-27` | Not independently re-verified | Assembled in `app/api/reset-password/[token]/route.ts` (GET handler) | Recommend spot-check during modeling |
| `CreatePasswordResetRequest` | `types/password-reset.ts:29-32` | Confirmed-accurate | Request body for `generate-reset-link/route.ts` | Matches |
| `PasswordResetValidationInfo` | `types/password-reset.ts:34-49` | Not independently re-verified | `app/api/reset-password/[token]/route.ts` GET response shape | Recommend spot-check |
| `CompletePasswordResetRequest` | `types/password-reset.ts:51-54` | Confirmed-accurate | Request body for `reset-password/[token]/route.ts` POST, consumed at `:150-168` (`bcrypt.hash(newPassword, 12)`) | Matches |
| `Player` | `types/player.ts:1-8` | Confirmed-accurate | `lib/db.ts:1195-1300` (`getScoreboardWithPicks`) | `{id, name, points, strikes, rank, weeklyPick?}` matches the assembled object at `lib/db.ts:1220-1227` / `:1284-1291` exactly |
| `PrizeType` | `types/season-summary.ts:1` | Confirmed-accurate | `lib/db.ts:1830-1874` (`getSeasonSummary`'s `prizes.push(...)` calls) | All four literal values (`first_place`, `second_place`, `longest_survivor`, `highest_total_points`) match exactly, no fifth prize type found anywhere |
| `PrizeWinner` | `types/season-summary.ts:3-10` | Confirmed-accurate | Same, `lib/db.ts:1830-1874` | Matches field-for-field including optional `payout?` |
| `FinalStanding` | `types/season-summary.ts:12-19` | Confirmed-accurate | `lib/db.ts:1877-1885` | Matches exactly |
| `SeasonSummary` | `types/season-summary.ts:21-25` | Confirmed-accurate | `lib/db.ts:1709,1732` (both early-return and full-computation paths) | Matches |

**Summary**: 18 of 23 types confirmed-accurate as written (or accurate modulo a
spot-check recommendation, not a confirmed drift), 3 need a fix during modeling
(`Pick.result` — known issue, plus a newly-found companion logic bug in `createPick`;
`League.id`/`League.createdBy` — new, systemic `number`-vs-`string` drift), 1 has no
ground truth to model against (`JoinRequest` — tie to the Table 3 join-request
disposition decision), and 1 should be excluded entirely (`SportsLeagueOption` — not
a backend type).

---

## Summary of what changed vs. `CR-101-FINDINGS-B.md` / `-C.md`

- **All 24 routes and 33/36 `lib/db.ts` functions flip from their pilot-scoped
  verdicts to `MOVE-TO-PYTHON`.** This is the expected, mechanical consequence of
  the scope expansion (parent ticket's context section), not a surprise finding by
  itself.
- **New, not previously flagged**: `createInvitationIndexes` (`lib/db.ts:1557`) has
  the identical "zero live-route importers" profile as `createGame`/
  `createGameIndexes` but was missing from both `CR-101-FINDINGS-B.md`'s dead-code
  note and `CR-101-FINDINGS-C.md` Table 1a. Added to the cut list (Table 3, item 3).
- **New, not previously flagged**: `League.id` and `League.createdBy` are typed
  `number` in `types/league.ts` but are `string` (`ObjectId.toString()`) at every
  write and read site in `lib/db.ts`, and `lib/api-client.ts` repeats the same wrong
  `number` typing in 15+ function signatures. This is a bigger, more systemic drift
  than the known `Pick.result`/`"draw"` case — it affects every League-returning
  function, not one field on one collection — and was not surfaced in
  `CR-101-FINDINGS-C.md`'s Table 2 (which focused on the shared-Mongo pilot seam,
  not a general type audit). Surfaced here because scope item 4 asked to diff each
  type against ground truth rather than copy it.
- **New, not previously flagged**: `lib/db.ts:801-809` (`createPick`'s own inline
  result computation) has a tie-handling bug independent of the type-level `"draw"`
  omission — it mislabels picks against already-completed drawn games as `"loss"`,
  and that mistake is permanent because the scoring job only revisits `null`
  results. This is a genuine correctness bug the port should fix, not just a
  contract-typing gap.
- **Re-confirmed unchanged**: the `lib/game-utils.ts` duplicate-logic case (scope
  item 2) — re-grepped broadly against current `main` and found no second instance;
  the only near-miss (`lib/api.ts`) turned out to be a false positive from
  substring-matching import paths, not a real duplicate.
- **Re-confirmed unchanged**: all 4 originally-named cut-list cases (scope item 3)
  are still present and unchanged on current `main`; three of the five join-request
  stub functions (`getPlayerProfile`, `approveJoinRequest`/`rejectJoinRequest`,
  `requestToJoinLeague`, `getJoinRequests`) are actively wired into live UI pages
  that currently throw or silently no-op for end users — this wasn't explicit in
  the prior findings and sharpens the disposition decision (these aren't dead code
  to quietly drop, they're a visibly broken feature to explicitly build or retire).

---

## Addendum — user-flow review (2026-08-06)

Before Phase 1, the team walked Table 4 against three plain-language user flows
(Registration, Picking, Scoring) to check for models with no flow and flows with no
model. Outcome:

**Dropped** (see Table 3/4 rows above for the mechanical edits):
- `JoinRequest` + its 4 backing functions (`approveJoinRequest`, `rejectJoinRequest`,
  `requestToJoinLeague`, `getJoinRequests`) — no flow describes a request-to-join
  path; registration is invite-only. Confirms Table 3's independent "no ground truth"
  finding from a product-intent angle, not just a code angle.
- `SportsLeagueOption` — product direction is now **EPL-only**. The multi-sport
  admin picker this type powered is being removed, not just left unmodeled.
  `League.sportsLeague` likely collapses to a fixed value; **confirm in Phase 1**
  whether the field is kept (as a constant) or dropped from the model entirely.

**Kept, reclassified**: the password-reset family (`PasswordResetToken`,
`PasswordResetTokenWithUser`, `CreatePasswordResetRequest`,
`PasswordResetValidationInfo`, `CompletePasswordResetRequest`) doesn't map to
Registration/Picking/Scoring, but is a real, live, well-implemented feature — treat
it as its own **"Account management"** category rather than a gap.

**New models needed** (gaps the original audit couldn't see, since it only diffed
*existing* `types/` exports against their write sites):
- **Picks-remaining.** `GET /api/picks/remaining` (`app/api/picks/remaining/route.ts:26-33`)
  returns an anonymous inline `{ team: Team, remaining: number }[]` with no name
  anywhere in `types/`. Straightforward to type — add a named model (e.g.
  `TeamPicksRemaining`) in Phase 1 rather than porting it as an untyped shape.
- **Player profile.** `getPlayerProfile` (`lib/api-client.ts:263-264`) is typed to
  return `Player`, but `Player` (`types/player.ts:1-8`) is the scoreboard-row shape
  (`id, name, points, strikes, rank, weeklyPick?`) — thin for a dedicated profile
  page. Add a `PlayerProfile` model in Phase 1; `Player` is likely a subset/view of
  it rather than the same type reused as-is. This also un-blocks Table 3 item 4
  (`getPlayerProfile`), which stays **build-for-real**.

**New capability surfaced, not previously scoped anywhere** (no TS code, no port-list
entry, no prior ticket): **season rollover.** Requirement: keep the same league
(preserve identity, membership history, add/drop members) across a season boundary
(e.g. the next EPL season) while repopulating teams/fixtures and starting standings
fresh. Checked against the schema: `League.season` (`lib/db.ts:97-138`) and
`current_game_week`/`current_pick_week`/`last_completed_week` live directly on the
`League` document; `LeagueMembership.points`/`strikes`/`rank`
(`types/league.ts:20-35`) are cumulative counters living directly on the membership
record, 1:1 with the league — there is no per-season slot for them today. `Team` is
already a global catalog and `Game`/`Pick` already carry their own `season` field, so
historical games/picks survive a rollover for free; membership stats do not.

**Decision: in-place rollover** (not a League/Season entity split). A new "start new
season" operation: archive current standings into `SeasonSummary` (if not already
done), then reset `League.season` / `current_*_week` and each active
`LeagueMembership`'s `points`/`strikes`/`rank` in place, keeping the same
`League._id` so invites/membership history stay linked. Repopulate `Team`/`Game` for
the new season via the existing import-script pattern
(`scripts/import-epl-2025-fixtures.ts`), adapted to target an existing league rather
than only `scripts/create-epl-league.ts`'s new-league path. **Add this as a new
Table 1 port-list item** (Rank 2, Leagues) in Phase 1 — it doesn't exist in any form
today, TS or otherwise, so it wasn't in the original port inventory.

## Scope items not fully resolved (flagged, not fixed)

- **Cut-list dispositions (Table 3, items 4–9) are recommendations, not decisions.**
  This audit surfaces the evidence (UI wiring, or lack of it) needed to make each
  call but does not make product decisions on the team's behalf — the ticket's
  Goal frames these as team-reviewed findings, and "build for real vs. drop" for a
  user-facing feature (join requests, league deletion, player profiles) is exactly
  that kind of call.
- **`InvitationWithLeague`, `InvitationAcceptanceInfo`, `PasswordResetTokenWithUser`,
  `PasswordResetValidationInfo`** (Table 4) were checked for structural plausibility
  against their write/assembly sites but not diffed field-by-field with the same
  rigor as the other 19 types, in the interest of closing this audit at its Story
  Points-3 scope rather than re-deriving every nested join shape by hand. Flagged
  explicitly as lower-confidence rows rather than silently presented at the same
  confidence as the rest of the table.

---

## Addendum 2 — Phase 1 open-items resolution (2026-08-06)

Decisions made against the open items `CR-105-PHASE1-REPORT.md` raised for review.
Team-reviewed; code updated where the decision changed a shipped Phase 1 artifact.

- **`PlayerProfile`/picks split — DECIDED, reversed from Phase 1's judgment call.**
  Phase 1 folded `picks: List[Pick]` into `PlayerProfile` so `app/player/[id]/page.tsx`
  could make one call instead of two (see original Table 4 Addendum entry above).
  Reversed: a profile is **public** within a league (any member can view any other
  member's `id/name/teamName/points/strikes/rank/totalWeeksInSeason`), but a user's
  pick history is **private** — only the pick-owner should see it. Bundling `picks`
  into the public-profile response would have exposed every member's full pick
  history to every other member via `app/player/[id]`, exactly the class of gap
  Table 1 5.4 already named ("today's `app/api/picks/route.ts` has no auth check at
  all — trusts a client-supplied `user_id`"). **`app/models/player_profile.py`
  updated**: `picks` field removed. Phase 2 must build `GET /picks` (or its Python
  equivalent) with a hard requester-must-equal-queried-user check (self, or a
  league-admin override if that's wanted later) — this is not optional cleanup, it's
  the actual privacy boundary the split depends on. `app/profile/page.tsx` (self)
  keeps calling both profile and picks; `app/player/[id]/page.tsx` (viewing someone
  else) must stop calling picks for another user entirely once Phase 2 routes exist.

- **Season rollover — DEFERRED, not dropped.** The Addendum's in-place-rollover
  design (archived `seasonArchive` field, reset counters in place) and Phase 1's
  `start_new_season`/`archive_summary` implementation stay as already written in
  `app/db/leagues.py`, but this is explicitly **not** part of Phase 2's build
  target. No season boundary is imminent; revisit when one actually approaches.
  Worst case, come back and rework the schema then — nothing downstream depends on
  it yet.

- **`username` drift — DECIDED (not just "recommended"), now a confirmed 4th drift
  fix.** `InvitationCreatorSummary.username`, `InvitationAcceptanceInfoCreator.username`,
  and the password-reset family's `PasswordResetUserSummary.username`/
  `PasswordResetCreatorSummary.username` are correctly `Optional[str] = None` in the
  shipped Phase 1 code (`app/models/invitation.py`, `app/models/password_reset.py`)
  — no code change needed, this just promotes the Phase 1 report's "recommend
  treating this as a fourth drift-fix" from a suggestion to a decision. Table 4
  should be read as if `InvitationCreatorSummary`/`InvitationAcceptanceInfoCreator`/
  `PasswordResetUserSummary`/`PasswordResetCreatorSummary` carry the same
  drift-fixed status as the `Pick.result` and `League.id`/`createdBy` rows.

- **UTC-only date matching — CONFIRMED as parity, not a gap.** The deploy target
  (Heroku, per `README.md`'s "Production Deployment to Heroku" section and
  `.env.example`) runs its dynos in UTC by default, and no `TZ` config var is set
  anywhere in this repo (`.env.example`, `Procfile`, or elsewhere) to override that.
  `lib/game-updater.ts`'s `date-fns format()` calls (`lib/game-updater.ts:221,224,470-471`)
  therefore already run in UTC in production today, same as `app/db/game_updater.py`'s
  UTC-only port. No behavior change needed — this was aim-for-parity by construction,
  just not confirmed against the actual deploy target until now.

- **`League.sportsLeague` — DECIDED: keep the field, fixed value for now.** Not
  dropped, not made a free-form user choice. Product direction is EPL-only;
  `sportsLeague` stays a plain `str` on the model (already how `app/models/league.py`
  has it) with an effectively fixed value (`"EPL"`) rather than exposing the
  multi-sport picker `SportsLeagueOption` used to power. Expanding it back into a
  real user-selectable field is a future-phase product decision, not a Phase 2
  migration concern — no further code change needed now.

- **Validation — ELEVATED to a required Phase 2 deliverable, not an optional
  follow-up.** Two validation gaps carry forward as must-do, not nice-to-have:
  (1) the Table 2 golden-fixture test recommendation — a fixed set of
  `{startTime, status, current_game_week, current_pick_week}` inputs run through
  both the TS `lib/game-utils.ts` functions and their Python ports
  (`computeGameStatus`, `canPickFromGame`, `canChangeExistingPick`,
  `hasGameweekStarted`, `arePicksLocked`), asserting identical booleans — the
  mechanism that actually keeps the two languages in sync, not "keep them the same
  by eye"; and (2) exercising the Phase 1 `app/db/` layer against a real MongoDB
  instance, which Phase 1 never had access to do. Both must land before or
  alongside Phase 2's route build, not after.
