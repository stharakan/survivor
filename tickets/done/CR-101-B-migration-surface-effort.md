# CR-101-B: Migration Surface & Effort Estimate

**Parent**: CR-101 (Architecture & Backend-Language Spike), in
`tickets/COLLABORATION_READINESS_EPIC.md` — satisfies **AC4**
**Type**: Spike / Research (read-only)
**Priority**: High
**Story Points**: 2
**Status**: Proposed
**Owner**: Sonnet agent (research) → findings reviewed by team
**Parallel with**: CR-101-A, CR-101-C, CR-101-D

## Goal

Produce a concrete inventory of what would move to a Python/FastAPI backend vs. what
stays in the Next.js layer, and a t-shirt effort estimate for the port. This is the
"how much work" half of the go/no-go.

## Agent brief

Read-only. Do **not** change code. Produce a markdown findings section with a
classification table. Cite every claim as `file:line`. Classify honestly — when a
route mixes auth and data logic, say so rather than forcing a bucket.

## Scope

Inventory and classify each of these as **MOVE-TO-PYTHON**, **STAYS-IN-NEXTJS**, or
**SPLIT/UNCLEAR**, with a one-line reason:

1. **API routes** — all 24 route handlers under `app/api/` (found via
   `find app/api -name route.ts`). Auth routes (`app/api/auth/*`) and anything doing
   JWT/cookie/session work almost certainly **stay** (see `lib/auth-utils.ts`).
2. **Data layer** — `lib/db.ts` (~1,887 lines, ~35 exported functions). This is the
   bulk of the surface; group the exports by concern (users/auth, leagues, memberships,
   games, picks, scoring/results) so the estimate isn't one undifferentiated blob.
3. **Domain logic** — `lib/scoring.ts`, `lib/game-utils.ts`, `lib/game-updater.ts`
   (~576 lines). These are the coherent Python-owned chunk the epic describes.
4. **Scripts / jobs** — `scripts/*` and the scheduled scoring (`*/15`) + game-update
   (`0 */3`) jobs. Note the CR-004 seam: these already ping endpoints and are the
   cleanest place to **pilot** the Python backend.
5. **Next.js server-feature dependency check** — does the app rely on SSR or other
   server-only Next features, or could the frontend be a static export? This answer
   feeds CR-101-A's single-dyno idea directly, so state it clearly.

## Deliverable

Write to **`tickets/CR-101-FINDINGS-B.md`** (your own file — the other three CR-101
sub-tickets run in parallel and write their own `-A/-C/-D` files, so do NOT touch a
shared file; the team concatenates the four into `CR-101-FINDINGS.md` afterward). Head
it with **"## AC4 — Migration Surface & Effort"** and include:
- The classification table (surface item → bucket → reason → `file:line`).
- A grouped effort estimate (S/M/L per concern group), highlighting `lib/db.ts` as the
  largest single piece.
- A recommended **phased path**: which slice to port first (candidate: the scheduled
  jobs / scoring, per DEC-3) and what stays untouched in Next.js in phase 1.
- A one-line answer to the SSR/static-export question for CR-101-A.

## Out of scope
Hosting cost (CR-101-A), contract tooling (CR-101-C), repo layout (CR-101-D),
the go/no-go (team, AC7).
