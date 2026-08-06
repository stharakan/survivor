# CR-101-A: Cost & Hosting Analysis

**Parent**: CR-101 (Architecture & Backend-Language Spike), in
`tickets/COLLABORATION_READINESS_EPIC.md` — satisfies **AC1**
**Type**: Spike / Research (read-only)
**Priority**: High — **critical path.** A no-fit here likely forces AC7 to no-go.
**Story Points**: 2
**Status**: Proposed
**Owner**: Sonnet agent (research) → findings reviewed by team
**Parallel with**: CR-101-B, CR-101-C, CR-101-D

## Goal

Determine whether a separate Python (FastAPI) backend can be hosted **at or near $0**,
and whether the overall FE/BE-split topology is cost-neutral or cost-reducing vs.
today's spend. This is the primary axis of the whole CR-101 decision.

## Agent brief

Read-only. Do **not** change code or infra. Produce a markdown findings section.
Cite every codebase claim as `file:line`. For every external pricing/free-tier claim,
give the source and the date it was checked (free tiers change — this is 2026 data).
Do not present a recommendation as a fact; separate "findings" from "assessment."

## Scope

1. **Establish today's baseline.**
   - Confirm the current web host and tier. Repo evidence: `Procfile` (`web: npm start`),
     any Heroku config, `next.config.mjs`. Note what the repo can and cannot tell us —
     the actual dyno tier and Atlas plan may only live in the provider consoles, so
     flag those as "needs owner confirmation" rather than guessing.
   - Note the current DB: MongoDB (Atlas presumed). Flag Atlas tier/spend as a
     team-supplied input.

2. **Cost a second (Python) runtime at/near $0.** For each option capture the current
   free-tier limits, scale-to-zero / cold-start behavior, and any card-required or
   sleep caveats:
   - Cloud Run scale-to-zero **inside the existing GCP project** (note: the CR-004
     scheduled jobs already live in GCP — relevant to reuse).
   - Fly.io free allowance.
   - Render free tier.
   - Railway free/usage tier.

3. **Evaluate the single-dyno packaging idea** (see epic "Deployment packaging idea"):
   one Heroku app where the Python backend serves compiled static frontend assets
   (FastAPI `StaticFiles`) + the API from one dyno.
   - Cross-check feasibility against Task B's finding on whether the app depends on
     Next.js server features (SSR / API routes). If it does, this idea is constrained —
     say so and defer the hard confirmation to B.
   - Compare against two-process topologies (two Heroku process types; Cloud Run API +
     static FE host).

## Deliverable

Write to **`tickets/CR-101-FINDINGS-A.md`** (your own file — the other three CR-101
sub-tickets run in parallel and write their own `-B/-C/-D` files, so do NOT touch a
shared file; the team concatenates the four into `CR-101-FINDINGS.md` afterward). Head
it with **"## AC1 — Cost & Hosting"** and include:
- A cost table: **today vs. each candidate topology** (monthly $, free-tier headroom,
  cold-start/sleep caveat).
- An explicit **cost-neutral / not-cost-neutral** verdict per option.
- A shortlist (1–2) of viable at/near-$0 hosting paths, or a clear statement that no
  free-tier fit exists (which the team will read as a strong no-go signal for the split).
- A list of team-supplied inputs still needed (current Heroku tier, Atlas plan/spend,
  GCP project/region).

## Out of scope
Effort to port code (CR-101-B), contract mechanism (CR-101-C), repo layout (CR-101-D),
the go/no-go itself (team, AC7).
