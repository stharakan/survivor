# CR-101-C: Contract Mechanism Evaluation

**Parent**: CR-101 (Architecture & Backend-Language Spike), in
`tickets/COLLABORATION_READINESS_EPIC.md` — satisfies **AC3**
**Type**: Spike / Research (read-only)
**Priority**: Medium-High
**Story Points**: 1
**Status**: Proposed
**Owner**: Sonnet agent (research) → findings reviewed by team
**Parallel with**: CR-101-A, CR-101-B, CR-101-D

## Goal

Recommend how the frontend/backend data contract stays in sync so it cannot drift
silently (a Success Metric of the epic and the guardrail that DEC-4 uses to justify
staying on MongoDB instead of SQL).

## Agent brief

Read-only. Do **not** change code. Produce a markdown findings section with a single
recommendation. Cite current type usage as `file:line`.

## Scope

1. **Map today's type surface.** How the frontend currently defines and consumes the
   data shapes crossing the API boundary: the `types/` directory, `lib/api-types.ts`,
   `lib/api-client.ts`. Note that `zod` is already a dependency (relevant to the
   hand-written fallback and to runtime validation).
2. **Evaluate two mechanisms:**
   - **Generated:** Pydantic models → FastAPI OpenAPI schema → TS types via a generator
     (e.g. `openapi-typescript`), run in CI so `types/` is generated, not hand-edited.
   - **Hand-written + drift check:** keep `types/` by hand, add a CI job that fails if
     the committed TS types and the OpenAPI schema diverge.
   For each: what runs in CI, failure modes, day-to-day ergonomics for a
   Python-strong / TS-lighter collaborator, and setup cost.
3. Note the dependency: the generated path only exists if AC7 lands on a FastAPI
   backend. State what the recommendation is **if** the split happens vs. the TS-only
   monolith fallback (a zod-derived single source of truth).

## Deliverable

Write to **`tickets/CR-101-FINDINGS-C.md`** (your own file — the other three CR-101
sub-tickets run in parallel and write their own `-A/-B/-D` files, so do NOT touch a
shared file; the team concatenates the four into `CR-101-FINDINGS.md` afterward). Head
it with **"## AC3 — Contract Mechanism"** and include:
- A short comparison (generated vs. hand-written+CI-check).
- A single recommendation, conditioned on the go/no-go outcome.
- The concrete CI step(s) the chosen mechanism would add (ties into CR-002).

## Out of scope
Hosting cost (CR-101-A), port effort (CR-101-B), repo layout (CR-101-D),
the go/no-go (team, AC7).
