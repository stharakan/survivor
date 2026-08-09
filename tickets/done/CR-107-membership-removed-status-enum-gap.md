# CR-107: `LeagueMembership.status` Pydantic enum rejects "removed" -- breaks members/scoreboard/results

**Ticket ID**: CR-107
**Title**: Add "removed" to the Python `status` Literal so leagues with a removed member don't 400 on members/scoreboard/results
**Type**: Bug
**Priority**: Critical — was broken in production data, blocked CR-106 AC8, blocked go-live (~Aug 13-16) and season start (~Aug 20)
**Story Points**: 1
**Status**: Done
**Parent**: CR-106 (found during AC8's browser-based end-to-end verification)

## Summary

`api/app/models/league.py:54` declares:

    status: Literal["active", "pending", "rejected"]

But `remove_member_from_league` (`api/app/db/memberships.py:228`, a faithful port of
`lib/db.ts:631`) writes `status: "removed"` when an admin removes a member from a
league. Every read path that loads *all* members for a league and shapes them into
`LeagueMembership` Pydantic models (`get_league_members` in
`api/app/db/memberships.py:90-98`) throws a Pydantic validation error the instant it
hits a doc with `status: "removed"` — there's no per-doc error handling, so one bad
doc 400s the whole response.

**This is not hypothetical or dev-only** — "Tharakan Bros Survivor League" (the real
league, cloned sanitized into `survivor-league-dev` for testing) already has one
removed member (team "The Victors"). Confirmed live right now against a real
`uvicorn` + Mongo Atlas dev-clone run:

    curl .../api/leagues/689ac6df431134389631c9c8/members
    → 400 {"error":"Validation error: Input should be 'active', 'pending' or 'rejected'"}

    curl .../api/leagues/689ac6df431134389631c9c8/scoreboard
    → 400 {"error":"Validation error: Input should be 'active', 'pending' or 'rejected'"}

`results.py`'s scoreboard/season-summary functions filter on `m.status == "active"`
*after* calling the same `get_league_members`, so they hit the identical crash before
the filter ever runs — the scoreboard is broken for this league too, not just the
admin members tab.

## Root cause detail

This gap predates the Python port: `types/league.ts:34` has the exact same narrow
union (`"active" | "pending" | "rejected"`) and never included `"removed"` either.
It never surfaced as a bug in the TS app because TypeScript types are erased at
runtime — assigning an object with `status: 'removed'` never actually gets checked
against the `LeagueMembership` interface at the point the route handler returns it,
so the old Next.js API routes silently served it. Pydantic enforces its `Literal` at
the Mongo-doc-to-model boundary on every single request, so the same latent
type-annotation gap becomes a hard 400 the moment a real removed-member doc exists.
Not a regression introduced by CR-106's static-export work — a pre-existing bug that
the Python port's stricter validation turned from silent-and-harmless into
loud-and-broken.

## Acceptance Criteria

**AC1 — Fix the enum** ✅ Done
`api/app/models/league.py`'s `status` field is now
`Literal["active", "pending", "rejected", "removed"]`, mirrored in
`types/league.ts`. Landed in `7000f24`.

**AC2 — Verify against real data** ✅ Done
Reverified as part of CR-106 AC8's browser pass against a fresh `uvicorn` +
`survivor-league-dev`: `/members` and `/scoreboard` for the real "Tharakan Bros"
league (the one with a removed member) no longer 400 -- confirmed both via a
pre-login 401 (auth-required, not the old 400 validation error) and via the
actual browser walkthrough logged in as an admin. `/results` /
season-summary not separately spot-checked but goes through the same
`get_league_members` call path.

**AC3 — Confirm removed members are actually excluded, not just no-longer-crashing** ✅ Done
Verified in the browser: admin members tab for Tharakan Bros renders correctly
with the removed member excluded from the active count, consistent with the
existing `status == "active"` filters.

**AC4 — Quick audit of the other Literal-typed status/result fields** ✅ Done
Spot-checked while diagnosing this (`league_memberships.status`,
`games.status`, `picks.result`) against the live dev-clone data — only
`league_memberships.status` had drift (`distinct()` returned `['active', 'removed']`
against a `Literal` missing `'removed'`; `games.status` and `picks.result` both
matched their Literals exactly: `['completed', 'not_started']` and
`[null, 'draw', 'loss', 'win']`). No further action taken -- dev-clone is
sanitized on user PII, not on status/result values, so this should hold against
prod, but no direct prod-data audit was run.

## Discovered via

CR-106 AC8 (real browser-based E2E walkthrough, not curl) — this is exactly the class
of bug curl-only testing wouldn't have caught quickly, since it only shows up when
loading a real page (`/admin` members tab, `/scoreboard`) against real, previously-
mutated production-shaped data rather than a fresh/happy-path fixture.

## Dependencies / Cross-references

- Blocks CR-106 AC8 completion — the admin-toggle-paid/unpaid step and general
  scoreboard sanity can't be verified end-to-end while this 400s.
- Unrelated fix landed in the same investigation, not part of this ticket's scope but
  noted for history: `scripts/clone-prod-to-dev.ts` was generating dev-clone emails
  as `user{N}@dev.local`, which Pydantic's `EmailStr` rejects outright (`.local` is
  an IANA special-use TLD) even though the original Zod validator accepted it. Fixed
  by renaming to `user{N}@dev.internal` (script + the then-current 62 accounts in
  `survivor-league-dev`) rather than loosening the Python validator, since the
  stricter behavior is arguably correct for real user input and no real prod email
  would ever hit it.

## Timeline

Landed and reverified as part of CR-106 AC8's browser pass, before go-live.
