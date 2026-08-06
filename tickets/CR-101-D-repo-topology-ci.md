# CR-101-D: Repo Topology & Path-Aware CI Sketch

**Parent**: CR-101 (Architecture & Backend-Language Spike), in
`tickets/COLLABORATION_READINESS_EPIC.md` — satisfies **AC2**
**Type**: Spike / Research (read-only)
**Priority**: Medium
**Story Points**: 1
**Status**: Proposed
**Owner**: Sonnet agent (research) → findings reviewed by team
**Parallel with**: CR-101-A, CR-101-B, CR-101-C

## Goal

Confirm the repo layout for a FE/BE split (the epic strongly pre-recommends a
**monorepo**) and produce the concrete directory layout + a path-aware CI sketch that
CR-002 can adopt directly.

## Agent brief

Read-only. Do **not** change code or add workflows — this task **sketches** the CI, it
does not implement it. Produce a markdown findings section. The epic already argues the
monorepo case (see "Repository topology" section); your job is to confirm feasibility
against this repo's actual structure and make the layout concrete, not to re-argue it
from scratch. Flag any real blocker if one exists.

## Scope

1. **Confirm monorepo feasibility** against the current single Next.js app at repo root.
   Propose the concrete layout: `apps/web` (existing Next.js) + `apps/api` (FastAPI),
   or a simpler `api/` dir alongside the current app. Note what moves and what a
   root-level `package.json` / config split implies.
2. **Path-aware CI sketch.** A GitHub Actions workflow structured so:
   - changes under the web path → run `tsc --noEmit`, `npm run lint`, `npm test` (jest);
   - changes under the api path → run `pytest`, `ruff`/`mypy`;
   - jobs are gated per changed path so every PR doesn't run everything.
   This is the same structure CR-002 AC5 asks for — **explicitly cross-reference CR-002**
   so the two don't diverge; this task produces the sketch, CR-002 implements it.
3. Note the two-repo alternative briefly and why it's not recommended for a two-person
   hobby-scale project (contract change spanning two PRs, out-of-order deploy, doubled
   onboarding) — one paragraph, per the epic.

## Deliverable

Write to **`tickets/CR-101-FINDINGS-D.md`** (your own file — the other three CR-101
sub-tickets run in parallel and write their own `-A/-B/-C` files, so do NOT touch a
shared file; the team concatenates the four into `CR-101-FINDINGS.md` afterward). Head
it with **"## AC2 — Repo Topology"** and include:
- The recommended layout (as a directory tree).
- The path-aware CI sketch (YAML skeleton with path filters + per-language jobs).
- A one-paragraph note on the interaction with CR-002 and CR-203 (documenting the
  layout).

## Out of scope
Hosting cost (CR-101-A), port effort (CR-101-B), contract tooling (CR-101-C),
the go/no-go (team, AC7).
