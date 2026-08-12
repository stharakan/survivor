# CR-108: Retire `lib/scoring.ts`, `lib/game-updater.ts`, `lib/auth-utils.ts`

**Ticket ID**: CR-108
**Title**: Delete orphaned TS scoring/game-update/auth files whose Python twins
are already the live implementation; convert `scripts/update-games.ts` to an
HTTP client like `scripts/calculate-scores.js` already is
**Type**: Cleanup / Tech Debt
**Priority**: Low-Medium — no prod-facing risk today, but it's an unguarded
correctness trap for the next person who touches scoring logic or runs an ops
script by hand
**Status**: Not started. Captured 2026-08-12 while discussing SUR-010 and
auditing which of the "kept for ops scripts" TS files (per CLAUDE.md's
"What's still TypeScript" section) are actually still reachable.
**Depends on**: nothing. Explicitly does **not** touch `lib/db.ts` /
`lib/mongodb.ts` — see "Out of scope" below and `tickets/SUR-010-league-season-split.md`.

## Problem

CLAUDE.md currently describes `lib/db.ts`, `lib/mongodb.ts`, `lib/auth-utils.ts`,
`lib/scoring.ts`, and `lib/game-updater.ts` as a group: "no longer used by the
web app at runtime... but still live — they back the Node ops scripts in
`scripts/`". That's stale for three of the five files. Traced each one's actual
importers:

- **`lib/auth-utils.ts`** — zero importers anywhere in the repo (grepped every
  `.ts`/`.tsx` file, including `scripts/`). Nothing calls it. It doesn't back
  any ops script; it's just dead code.
- **`lib/scoring.ts`** — imported only by `lib/game-updater.ts`.
- **`lib/game-updater.ts`** — imported only by `scripts/update-games.ts`, which
  is itself not wired into `package.json` (`grep -n "update-games" package.json`
  → no match), has no scheduler/cron config in the repo, and isn't mentioned in
  README.md or CLAUDE.md's command lists. Its own single git commit
  (`7472cc4`) describes it as "a testing script for the external api". Nothing
  runs it on a schedule — the real production game-score-update job is the
  Python one: `api/app/db/game_updater.py:503`'s docstring says as much
  directly ("Invoked on a cadence by the scheduled GCP job... not wired up
  here"), and it's exposed at `POST /api/admin/update-game-scores`
  (`api/app/routers/admin_scoring.py`), API-key gated the same way
  `/api/admin/recompute-scores` is.

**`scripts/calculate-scores.js` already made this exact transition** — it used
to call `lib/scoring.ts` directly and now is a thin HTTP client that POSTs to
`/api/admin/recompute-scores` with `X-API-Key`
(`scripts/calculate-scores.js:8-10,28-34`). `scripts/update-games.ts` just never
got the equivalent treatment and still calls `lib/game-updater.ts` directly
against Mongo.

**Active drift, not just redundancy**: `api/app/db/scoring.py`'s docstring
records that `calculate_pick_result` was fixed for a tie-handling bug there
(`app/db/picks.py`'s `create_pick` now imports the corrected version) — a fix
that was never mirrored back into `lib/scoring.ts`. Unlike
`lib/game-utils.ts`/`api/app/utils/game_utils.py`, there is **no golden-fixture
parity test** between `lib/scoring.ts`/`lib/game-updater.ts` and their Python
twins. So this isn't hypothetical: if anyone runs `npx tsx
scripts/update-games.ts` by hand today, it silently reproduces a bug the live
app no longer has, with nothing in CI to catch the mismatch.

## Acceptance Criteria

**AC1 — Delete the three orphaned files**
`lib/scoring.ts`, `lib/game-updater.ts`, `lib/auth-utils.ts` removed.
`lib/__tests__/scoring.test.ts` removed with them (it only exercises
`lib/scoring.ts`).

**AC2 — Convert `scripts/update-games.ts` to an HTTP client**
Rewrite it in the same style as `scripts/calculate-scores.js`: reads
`API_BASE_URL`/`SCORING_API_KEY` from env, POSTs to
`/api/admin/update-game-scores` with `X-API-Key`, timestamped logging of the
response summary, non-zero exit on failure. (Match `.js` vs `.ts` — check
whether `calculate-scores.js` is plain JS because `tsx` wasn't wanted for this
one, or just historical; keep `update-games` consistent with whichever the
team prefers, doesn't need to match file-extension-for-file-extension.)

**AC3 — Update docs**
- `CLAUDE.md`: remove `lib/auth-utils.ts`, `lib/scoring.ts`, `lib/game-updater.ts`
  from the "still TypeScript" paragraph and the directory-map line that
  mentions `auth-utils.ts/game-updater.ts`; drop or rephrase the
  `api/app/core/security.py` vs `lib/auth-utils.ts` comparison note (the file
  no longer exists) — point instead at `api/app/db/scoring.py`/`game_updater.py`
  as the sole live implementations; fix the stale `calculate-scores.ts`
  reference (actual file is `.js`).
- `README.md`: mirror the same edits (it currently duplicates this section).

**AC4 — Verify nothing else breaks**
- `npm test` passes without `scoring.test.ts`.
- `npx tsx scripts/update-games.ts` (renamed/rewritten) runs successfully
  against a local `uvicorn` dev instance and returns the same summary shape
  `calculate-scores.js` does.
- `grep -rn "auth-utils\|lib/scoring\|lib/game-updater" --include="*.ts" --include="*.tsx" --include="*.md" .` (excluding `tickets/`, `node_modules/`, and git history) returns nothing.

## Out of scope

`lib/db.ts` and `lib/mongodb.ts`. These back real, still-used scripts
(`scripts/init-db.ts`, `scripts/create-epl-league.ts`,
`scripts/backfill-external-ids.ts`, `scripts/import-epl-2025-fixtures.ts`) that
construct documents by hand outside the FastAPI/`api/app/db/*` code path, with
no parity test protecting them either. Retiring them is a bigger call — it was
explicitly deferred once already in `tickets/done/CR-105-FINDINGS.md` ("a
separate decision this audit does not make") — and is more urgent to *decide*
than to *execute*, since `tickets/SUR-010-league-season-split.md` is about to
change the exact document shapes `create-epl-league.ts`/`init-db.ts` write by
hand. See the note added to SUR-010 rather than duplicating that scoping here.
