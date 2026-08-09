# CR-105: Full-Migration Function & Contract Audit

**Parent**: CR-101 (Architecture & Backend-Language Spike),
`tickets/COLLABORATION_READINESS_EPIC.md` — Phase 0 of the migration path
**Type**: Spike / Audit (read-only, no code changes)
**Priority**: Critical — blocks all Pydantic-model and Python-port work
**Story Points**: 3
**Status**: Complete — findings in `CR-105-FINDINGS.md`. Join-request feature,
`SportsLeagueOption`, and league DELETE all dropped; password-reset kept as its own
category; two new models (picks-remaining, player profile) and one new capability
(in-place season rollover) identified per 2026-08-06 user-flow review (see FINDINGS
Addendum). `CR-101-FINDINGS.md` AC7 write-back done (2026-08-06). No open items
remain before Phase 1.
**Depends on**: none (can start immediately; reuses existing CR-101 research)
**Blocks**: Phase 1 (Pydantic models, `lib/db.ts` port), Phase 2 (route/domain-logic port)
**Owner**: Sonnet agent (research) → findings reviewed by team

## Agent brief

Read-only. Do **not** write any Pydantic model or Python code, and do not modify
`CR-101-FINDINGS*.md` (flag the AC7 discrepancy in your output instead of fixing it
there). Produce a markdown findings file with the four tables specified below. Cite
every claim as `file:line`. Where you flip a `STAYS-IN-NEXTJS` verdict to
`MOVE-TO-PYTHON`, say why in one line rather than flipping silently. Re-run the greps
called out in Scope items 3–4 against current `main` rather than trusting the prior
findings files verbatim — they were computed under a narrower pilot assumption that no
longer holds.

## Context — supersedes CR-101 AC7's recorded scope

`CR-101-FINDINGS.md`'s AC7 decision, as written, records a narrower pilot: one
FE-facing read endpoint (scoreboard or season-summary), contract scope (iii). In
follow-up discussion (not yet written back into that file), the decision was
expanded: **build the full Python backend, run it in parallel with the existing
Next.js/TS backend, validate parity, then deprecate the TS backend.** This ticket
operates under that expanded scope. `CR-101-FINDINGS.md` AC7 should be updated to
reflect this before anyone reads it as the current decision — flagged here, not
fixed by this ticket.

## Goal

Before any Pydantic model or Python function is written, produce four concrete
lists so the build phase is executing a plan, not discovering scope mid-port:
**port list, duplicate list, cut list, Pydantic model list.**

`CR-101-FINDINGS-B.md` (AC4) and `CR-101-FINDINGS-C.md` (AC3) already did most of
this legwork — 24 routes and 36 `lib/db.ts` functions classified, 23 `types/`
exports enumerated. The catch: those classifications were computed **under the
pilot assumption**. Most `STAYS-IN-NEXTJS` verdicts only held because the pilot was
scoped small. This audit re-cuts that existing material for full-migration scope
rather than starting from scratch.

## Scope

1. **Reclassify the route/function tables for full migration.** Take
   `CR-101-FINDINGS-B.md` §1 (24 routes) and §2 (36 `lib/db.ts` functions) and flip
   each `STAYS-IN-NEXTJS` verdict to `MOVE-TO-PYTHON` unless there's a reason it's
   pinned to the Next.js layer specifically (e.g. HTTP-only cookie issuance, if the
   frontend is staying on Next.js as a static/client shell). Resolve every
   `SPLIT/UNCLEAR` verdict into a firm decision now that the scope question that
   caused the "unclear" is settled.

2. **Enumerate the duplicate list.** `lib/game-utils.ts` is the known case —
   consumed by two client-rendered pages (UI state) *and* by the picks route
   (server-side pick-lock validation), per `CR-101-FINDINGS-B.md` §3. It cannot
   move wholesale: the UI-facing logic stays in TS, the server-validation logic
   needs a Python port, and the two must be kept in sync deliberately (name this
   risk explicitly, don't let it become a silent drift point). Grep for any other
   `lib/` or `app/` file imported by both a `page.tsx`/client component **and** an
   `app/api/*` route — `game-utils.ts` may not be the only one.

3. **Enumerate the cut list.** Confirm and finalize disposition (build-for-real vs.
   drop the feature) for each known dead/stub function before it gets ported as-is:
   - `lib/db.ts::createGame`, `createGameIndexes` — no importers from any live route
   - `getPlayerProfile`, `approveJoinRequest`, `rejectJoinRequest`,
     `requestToJoinLeague` (`lib/api-client.ts`) — throw "not implemented"
   - `getJoinRequests` — stub, always returns `[]`
   - `leagues/[leagueId]` DELETE — returns 501, unimplemented
   Re-run the grep patterns from `CR-101-FINDINGS-C.md` Table 1a (`not implemented`,
   stub returns) against current `main` in case anything shipped since — don't
   assume the list is still complete.

4. **Produce the Pydantic model list.** Map the (now full) port list against the 23
   `types/` exports from `CR-101-FINDINGS-C.md` §1b — but **diff each hand-written
   type against its actual runtime/DB shape**, don't copy it uncritically. At least
   one confirmed drift exists already: `types/pick.ts` omits `"draw"` while
   `lib/scoring.ts` writes it (`CR-101-FINDINGS-C.md` Table 2). Fix known drift while
   defining the model, not after.

5. **Order the port list into a build sequence.** Reuse `CR-101-FINDINGS-B.md`
   §"Grouped effort estimate"'s dependency order (auth → leagues → memberships →
   games → picks → invitations → scoring/results) as the default Phase 2 sequence
   unless this audit surfaces a reason to reorder.

## Deliverable

Write to `tickets/CR-105-FINDINGS.md`:
- **Table 1 — Port list**: every `lib/db.ts`/`scoring.ts`/`game-updater.ts`/route
  function, full-migration verdict, `file:line` citation, dependency-order rank.
- **Table 2 — Duplicate list**: each piece of logic that must exist in both
  languages, why it can't move wholesale, and who owns keeping the two in sync.
- **Table 3 — Cut list**: each dead/stub function, build-for-real-or-drop decision.
- **Table 4 — Pydantic model list**: one row per model, source `types/` file,
  confirmed-accurate or drift-fixed, `file:line` for the DB write site that defines
  ground truth.

## Out of scope

Writing any Pydantic model or Python code (Phase 1/2), the auth-boundary design
(already decided: direct JWT verification in FastAPI for browser routes, API-key
for cron/service-to-service — see epic discussion), cost-baseline owner
confirmations (separate Phase 0 item, not a function-level concern).
