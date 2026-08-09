# CR-101 — Architecture & Backend-Language Spike: Consolidated Findings

**Status**: Research complete (AC1–AC4) · AC7 go/no-go **DECIDED: GO** — see the
2026-08-06 scope-update note after AC7 below; the decision recorded inline in AC7
(read-endpoint pilot, contract option iii) was **superseded**, not replaced by a
different answer to the same question.
**Prepared**: 2026-08-05 · **Updated**: 2026-08-06

This is the executive synthesis. The detailed, cited research lives in four companion files:
- **AC1 — Cost & Hosting**: `CR-101-FINDINGS-A.md`
- **AC4 — Migration Surface & Effort**: `CR-101-FINDINGS-B.md`
- **AC3 — Contract Mechanism** (+ pilot-coverage addendum): `CR-101-FINDINGS-C.md`
- **AC2 — Repo Topology & CI**: `CR-101-FINDINGS-D.md`

All four were spot-checked against the actual code; their load-bearing claims hold.

> **Scope note (2026-08-06): read below before treating AC7's recorded answer as the
> ceiling of what's planned.** AC7 originally recorded a narrow pilot (one read
> endpoint, contract option iii). In follow-up discussion, that decision was
> **expanded**: build the full Python backend, run it in parallel with the existing
> Next.js/TS backend, validate parity, then deprecate the TS backend entirely. The
> pilot-scoped classifications below (e.g. AC4's route/`lib/db.ts` split) were
> re-audited for the full-migration scope in `CR-105-FINDINGS.md` — read that file
> for the current port list, not the pilot-scoped tables here. Kept in place below
> for the historical record of how the decision was reached. Full detail after AC7.

---

## Headline

**Cost is not the blocker the epic feared.** The epic framed a second runtime as the
biggest cost risk and treated "no free-tier fit" as a likely no-go. Research found two
durable at/near-$0 hosts, so **the decision now rests on effort and value, not cost.**
That inverts the epic's central worry — and shifts the real question to *what a first
step actually proves.*

---

## The four findings, compressed

### AC1 — Cost: no cost-based no-go
- Two viable ~$0 hosts: **Cloud Run in the existing GCP project** (strongest — reuses
  CR-004's billing/project, huge headroom vs. ~3k cron invocations/mo) and **Render
  free tier** (secondary; 15-min spin-down happens to align with the scoring cron).
  **Fly.io and Railway are not durably free in 2026** (~$2–5/mo).
- **Avoid** two Heroku process types (2–3× today's dyno cost). The single-dyno "Python
  serves static FE" idea is cost-neutral by construction but gated on static-export.
- **Baseline $ still unknown** — needs three owner confirmations: **Heroku dyno tier,
  MongoDB Atlas plan, GCP project + region** (region matters: Cloud Run's free tier
  only covers us-central1/east1/west1).

### AC4 — Surface: most code stays; there's a clean isolated chunk
- Only two files are clean movers: **`lib/scoring.ts` (227) + `lib/game-updater.ts`
  (576)** — Mongo-native, zero Next.js coupling, already triggered over HTTP by cron.
- `lib/game-utils.ts` must **stay** (shared by two UI pages + the picks route).
- `lib/db.ts` is the biggest file but ~1,160 of 1,887 lines have no reason to move.
- Frontend has **no hard SSR dependency**, so a fully static frontend is *reachable* —
  but only after all 24 API routes + middleware leave Next. **Phase-2+, not phase-1.**

### AC3 — Contract: the real risk, and it's already broken today
- Current contract is three uncoordinated pieces (hand-written `types/`, partial
  request-only Zod, `any`-typed responses). **No route validates any response shape.**
  With `ignoreBuildErrors: true` and no CI, nothing catches drift. There's even a live
  pre-existing drift: `types/pick.ts` omits `"draw"` while `scoring.ts` writes it.
- Mechanism recommendation forks on the decision: **go →** Pydantic→OpenAPI→
  `openapi-typescript` generated types; **no-go →** Zod-derived single source of truth.
  Either is strictly better than today.

### AC2 — Topology: monorepo, simpler than the epic proposed
- Recommend **`api/` alongside root**, NOT `apps/web` + `apps/api` nesting (nesting is
  pure churn, zero benefit at two-person scale). The `api/` approach is **strictly
  additive — zero changes to existing files.**
- Path-aware CI sketch is ready (`dorny/paths-filter` → per-language jobs); **CR-002
  implements it.**

---

## AC5 — Database decision

**MongoDB stays (confirms DEC-2 lean no-go).** No finding surfaced a concrete reason to
revisit SQL. DB access is centralized in `lib/db.ts`, bounding the surface either way.
The typed-schema guardrail that once argued for SQL is delivered instead by the AC3
contract mechanism (Pydantic on a go; Zod-derived on a no-go) at zero migration cost.

**Caveat carried forward:** the guardrail only counts if it covers the seam that
actually drifts. See the pilot analysis below — a naive "Pydantic on the HTTP
endpoints" does *not* cover the highest-risk shared-DB seam.

---

## The pilot question: what would a first step actually prove?

The epic (DEC-3) proposes piloting the Python backend on the **scheduled scoring /
game-update jobs** because they're the cleanest, most isolated seam. Research confirms
that isolation is real. But when you pin down the contract work that a responsible
pilot must include (AC3 addendum in `CR-101-FINDINGS-C.md`), a tension surfaces that
directly shapes the AC7 recommendation.

### What the pilot's contract work really is (not what it sounds like)

A pilot that ports scoring + game-updater integrates the two runtimes **through the
shared MongoDB**, not over HTTP. So:
- Its ~2 FastAPI endpoints (recompute-scores, update-game-scores) are **cron-only —
  no browser code calls them.** Putting Pydantic on them buys **0% coverage** of the
  frontend contract (34/34 `api-client.ts` calls and 23/23 `types/` objects stay
  uncontracted).
- The pilot instead opens a **new uncontracted surface**: 13 fields across 4
  collections that the Python writer puts into Mongo and Next.js reads straight back
  out (10 with live TS readers). HTTP-level Pydantic cannot cover this — there's no
  request/response involved.
- The scariest pair is `current_game_week` / `current_pick_week`, which gate
  pick-locking authorization in `app/api/picks/route.ts`. A writer/reader disagreement
  here fails **silently** as wrong pick-locking — no crash.

So the pilot's real contract deliverable is **"define and enforce the shared-DB
document schema on both sides of a language boundary"** (option (ii) in the addendum),
**not** "add Pydantic to FastAPI" (near-free and near-useless here).

### What the scoring pilot proves — and what it doesn't

| | Scoring pilot (shared Mongo) | One FE-facing read endpoint over HTTP |
|---|---|---|
| Hosting a Python runtime @ ~$0 | ✅ | ✅ |
| Collaborator can own a Python chunk (DEC-1) | ✅ | ✅ |
| Port correctness of scoring logic (CR-103) | ✅ | partial |
| Polyglot CI/deploy (CR-002, `api/` layout) | ✅ | ✅ |
| **The typed FE/BE HTTP contract (DEC-4)** | ❌ | ✅ |
| Interactive seam: auth-at-boundary, CORS, generated `types/` | ❌ | ✅ |
| Contract work transfers to the eventual full split | **Partly throwaway** | Directly |
| Risk / effort | Lower | Higher |

**The key insight for AC7:** the scoring pilot validates *operations and people* — can
we run Python here, and does the collaborator like owning it — but it **sidesteps the
single biggest architectural bet in the epic: the typed FE/BE contract.** Worse, the
shared-DB integration it hardens is *off-path* from the eventual HTTP-contract design
(that design exists precisely to avoid two services sharing collections), so some of
its contract work is thrown away if the full split later lands.

This is not a reason to reject a scoring pilot. It's a reason to **name what it proves
honestly** and not read a green scoring pilot as a "yes" to the FE/BE-split
architecture. If the go/no-go is really about the architecture, the endpoint pilot is
the one that de-risks it.

---

## AC6 — What this unblocks / invalidates

- **CR-102 (SQL migration):** formally **closeable** — AC5 confirms MongoDB stays; no
  finding reopened the SQL case.
- **CR-103 (consolidate scoring):** if a "go", consolidate scoring **directly in the
  target language** (Python) rather than in TS then porting. If a "no-go", do it in TS.
  Either way the shared-DB field list from the AC3 addendum defines the contract to lock.
- **CR-104 (README backend section):** unblocked once AC7 sets direction; rewrite once.
- **CR-007 (test `game-utils.ts`):** stays in TS regardless — `game-utils.ts` is
  shared client+server (AC4), so it's *not* moving to Python. The "hold pending CR-101"
  can be lifted; write these tests in TS.
- **CR-002 (CI) / CR-203 (docs):** adopt D's `api/`-alongside-root layout and path-aware
  CI sketch if a "go".
- **Independently valuable regardless of go/no-go:** fixing the contract mess (AC3
  no-go branch), and **CR-003** — the picks route has no auth *and* no request
  validation (surfaced independently by AC4 and AC3); arguably wider than currently
  scoped.

---

## AC7 — Go/No-Go  *(OPEN — team decision, not filled in by research)*

Research inputs are complete enough to decide. Two open confirmations gate a *final*
cost number and a *trusted* phase-1 plan:
1. The three cost baselines (Heroku tier, Atlas plan, GCP project+region) → turns AC1's
   "~$0" into a real delta.
2. Verify the shared-DB field contract (the 13 fields in the AC3 addendum) → turns
   AC4's "no code change" from assertion into fact.

**Decision to record here:**
- [ ] Go / No-go / Conditional -> GO
- [ ] If go: which pilot — **scoring (ops/people)** or **read-endpoint (architecture)** —
      and why, given the tension above
Read endpoint. We want to validate not jus tthat we can have python for the sake of python, 
but that we can enable better development. Python backend serves both collaborators comfort
while not inducing seriousmaintenance cost. the cost is in the one time shift BUT the one time
shift is an opportunity to rid the repo of dead code and enforce stricter contracts. Neither of 
those are "motivating factors" since they could be done independently; they are nice to haves. 
- [ ] Contract scope for the pilot (addendum option i / ii / iii)
iii
- [ ] Phased path
to be defined together

**Research author's assessment (labeled — not the decision):** a *conditional go on a
pilot only* is well-supported, but be deliberate about which pilot. If the goal is
"can we operate Python and does my collaborator want to own it," the scoring pilot is
cheapest and fine — scoped with option (ii) contract work on the shared-DB fields. If
the goal is "does the typed FE/BE-split architecture work for us," the scoring pilot
does not answer it; move one read endpoint (scoreboard or season-summary) over HTTP
with a real Pydantic→OpenAPI→TS contract instead. Defer the full split (static
frontend, moving interactive routes) to a later decision after the pilot proves out.

---

## Scope update (2026-08-06): pilot expanded to full migration

The decision recorded above (read-endpoint pilot, contract option iii) was **not
the final scope.** In follow-up discussion after this document was written, the team
expanded the decision: **build the full Python backend, run it in parallel with the
existing Next.js/TS backend, validate parity, then deprecate the TS backend
entirely.** There is no remaining "pilot-only" phase — every route and most of
`lib/db.ts` is headed to Python, not just one read endpoint.

What carries forward from the research above unchanged:
- **AC1 (cost)** and **AC2 (topology)** — hosting and repo-layout findings don't
  depend on pilot-vs-full scope.
- **AC3 (contract mechanism)** — Pydantic → OpenAPI → generated TS types, contract
  option iii, still the mechanism; it now applies to the whole route surface instead
  of one endpoint.
- **The auth-boundary decision** — direct JWT verification in FastAPI for browser
  routes, API-key for cron/service-to-service — already decided, unchanged.

What does **not** carry forward as-written:
- **AC4's route/`lib/db.ts` classification table** (`CR-101-FINDINGS-B.md` §1–2) —
  most `STAYS-IN-NEXTJS` verdicts there were conditioned on Next.js keeping the
  interactive backend under a pilot. That condition no longer holds. **The current
  port list is `CR-105-FINDINGS.md` Table 1**, not the table in `-B.md`.
- The pilot-vs-architecture tension named in "The pilot question" section above is
  moot — a full migration answers both halves (ops/people *and* the typed FE/BE
  contract) by construction, so there's no longer a choice to make between them.

`CR-105-full-migration-audit.md` / `CR-105-FINDINGS.md` is the Phase 0 artifact for
this expanded scope — full route/function reclassification, duplicate-logic list,
cut list, and Pydantic model list, including a 2026-08-06 user-flow review that
dropped the join-request feature and `SportsLeagueOption`, added two new models
(picks-remaining, player profile), and surfaced a new season-rollover capability not
previously scoped anywhere.
