# AC1 — Cost & Hosting

**Sub-ticket**: CR-101-A | **Type**: Spike / Research (read-only) | **Prepared**: 2026-08-05
**Scope reminder**: findings only — no recommendation is stated as fact. "Findings" are
codebase- or source-cited facts; "Assessment" sections are this agent's read of what the
findings imply and are explicitly labeled as such.

---

## 1. Baseline — what the repo can and cannot tell us

### Findings

- **Web host**: Heroku. The only deployment artifact in the repo is a single-line
  `Procfile` declaring one process type: `web: npm start` (`Procfile:1`). `package.json`'s
  `start` script is `next start` (`package.json:9`), i.e. a standard Next.js server process,
  not a static build.
- **No second process type is declared.** The `Procfile` has no `worker:` or other entry
  (`Procfile:1`), and there is no `app.json`, `Dockerfile`, or Heroku pipeline config
  anywhere in the repo root (checked via directory listing — none present). Today's
  topology is one dyno running one Node process.
- **No `engines` field** in `package.json` pins a Node version for the Heroku buildpack
  (checked `package.json:1-82` — no `engines` key present), so Heroku picks a default;
  not a cost fact but relevant to any future multi-buildpack change (§3).
- **`next.config.mjs` does not configure static export.** No `output: 'export'` (or
  `output: 'standalone'`) is set; the file explicitly notes standalone was removed
  ("Remove standalone output for npm start compatibility", `next.config.mjs:18-19`).
  Image optimization is also left **on** (`images.unoptimized: false`, `next.config.mjs:12-14`),
  which requires Next's server-side image pipeline. Both are evidence (not proof — that's
  Task B's job) that the app currently expects a running Next.js server, not a static bundle.
- **24 Next.js API routes exist** under `app/api/**/route.ts` (counted via `find`), and
  `middleware.ts` runs a server-side per-request auth check on every non-static path
  (`middleware.ts:17-59`), including an explicit comment that JWT verification can't run in
  Edge Runtime and is deferred to the route handlers (`middleware.ts:35-37`). This is more
  server-dependency surface that the single-dyno static-packaging idea (§3) would need to
  move to the Python backend.
- **DB**: MongoDB, Atlas presumed. `README.md:541-543` states Atlas is required because
  "Heroku doesn't provide MongoDB hosting." `.env.example:1-6` and `scripts/clone-prod-to-dev.ts:1,33`
  ("Clone production database to dev database on the same Atlas cluster") confirm Atlas is
  the actual production DB, not just a doc suggestion.
- **Scheduled jobs**: `scripts/README.md` documents two cron-style jobs and their
  cadence — scoring every 15 minutes (`scripts/README.md:84`, `:100`) and game-status
  updates every 3 hours (`scripts/README.md:519`, pattern `0 */3 * * *`). These match the
  cadences cited in the epic (`tickets/COLLABORATION_READINESS_EPIC.md:47`). **However, the
  repo's own script docs only show System Cron / Heroku Scheduler / GitHub Actions as
  example runners** (`scripts/README.md:79-123`) — there is no GCP-specific config, script,
  or reference anywhere in the repo (grepped for "gcp" across `app/`, `lib/`, `scripts/`:
  no hits outside the ticket files themselves). This is consistent with the epic's own
  claim (`tickets/COLLABORATION_READINESS_EPIC.md:87-93`, DEC-3) that the GCP scheduler
  config lives only in the console / on one machine and is invisible to the repo — the repo
  cannot confirm project, region, runner type (Cloud Function vs Cloud Run), or invocation
  volume for those jobs.

### What the repo cannot tell us (flagged, not guessed)

- **Actual Heroku dyno tier in production.** Not in the repo. Heroku's free dyno tier was
  discontinued account-wide on 2022-11-28 (Heroku Help, "Removal of Heroku Free Product
  Plans FAQ," checked 2026-08-05), so *some* paid tier is already running today — but which
  one (Eco $5/mo, Basic $7/mo, or higher) is not visible from the repo. **Needs owner
  confirmation from the Heroku dashboard/billing.**
- **Actual MongoDB Atlas tier/spend.** The repo only shows connection-string plumbing, not
  which Atlas tier is provisioned. `README.md:549` says "free tier is sufficient for
  testing" but says nothing about what production actually runs. **Needs owner
  confirmation from the Atlas console/billing.**
- **GCP project ID, region, and job runner type** for the existing scheduled jobs referenced
  in the epic. Not discoverable from this repo at all (see above). **Needs owner
  confirmation** — this also gates whether "reuse the existing GCP project" for Cloud Run
  is truly zero-onboarding (see §2).

---

## 2. Costing a second (Python) runtime at/near $0

All prices/limits below were checked 2026-08-05 via official pricing pages where fetchable,
cross-checked against current secondary sources where the official page didn't return
usable content to the fetch tool. Free tiers change often — re-verify before committing.

### Cloud Run (inside the existing GCP project)

- **Always-Free allowance**: 2,000,000 requests/month, 360,000 GiB-seconds memory/month,
  180,000 vCPU-seconds/month, 1 GiB North-America egress/month. Source: Google Cloud Run
  pricing page (cloud.google.com/run/pricing) content corroborated via web search summary,
  checked 2026-08-05.
- **Regional restriction**: Always-Free Cloud Run usage applies only in `us-central1`,
  `us-east1`, `us-west1`. Source: web search of Google Cloud free-tier documentation,
  checked 2026-08-05. **This makes the existing GCP project's region a hard input** — if
  the CR-004 jobs are outside those three regions, either the new Cloud Run service must be
  deployed in a different region than the existing jobs (breaking same-project-same-region
  simplicity) or free-tier eligibility is lost.
- **Card/billing requirement**: a billing account (card on file) must be linked to the GCP
  project to enable most APIs, Cloud Run included — but usage inside Always-Free limits is
  billed $0. Source: web search of Google Cloud Free Program docs, checked 2026-08-05.
  **Assessment**: since the epic states the CR-004 scheduled jobs already run in this same
  GCP project (`tickets/COLLABORATION_READINESS_EPIC.md:47`, `:91-93`), a billing account is
  presumably already attached — meaning this caveat is likely already satisfied by the
  existing project, not a new blocker. This is an inference from the epic's own claim, not
  independently confirmed (see team-supplied inputs, §4).
- **Cold start / scale-to-zero**: minInstances=0 (default) scales to zero when idle; first
  request after idle incurs a cold start, commonly single-digit seconds for a small
  container, longer for heavier dependency sets. Source: web search summary of Cloud Run
  behavior, checked 2026-08-05 (no official numeric SLA found for cold-start latency).
- **Headroom for this app**: a low-traffic family/friends league (per the epic's own
  framing, `tickets/COLLABORATION_READINESS_EPIC.md:32`) plus two cron-triggered jobs
  (every 15 min and every 3 hrs, ≈ 3,000/month combined invocations) sits nowhere near
  2M requests or 180k vCPU-seconds. Headroom is large.

### Fly.io

- **No free tier for new signups.** Fly.io removed free resource allowances for new
  accounts in 2024; new orgs get a trial limited to ~2 VM-hours or 7 days, and a credit
  card is required up front. Source: web search + fetch of fly.io/docs/about/pricing,
  checked 2026-08-05.
- **Minimum always-on cost**: roughly $2–5/month for the smallest shared-cpu-1x/256MB
  machine once the trial ends. Source: web search aggregating Fly.io pricing pages, checked
  2026-08-05.
- Legacy free allowances only apply to pre-2024 Hobby/Launch/Scale orgs, not applicable
  here since there's no existing Fly.io account in this repo/org.

### Render

- **Free web service tier exists**: one free web service, 750 compute hours/month, spins
  down after **15 minutes of inactivity** (recently tightened from 30 minutes in 2026).
  Source: web search of Render pricing/free-tier articles, checked 2026-08-05 — official
  render.com/pricing page content did not return usable detail via the fetch tool, so this
  is sourced from secondary aggregators, not Render's own page directly; **recommend the
  team re-verify against render.com/pricing before committing.**
- **Cold start on wake**: first request after spin-down takes roughly ~1 minute. Source:
  same web search, checked 2026-08-05.
- **Card requirement**: conflicting signals — Render's stated policy is no card required
  to start a free web service, but multiple community threads (2022–2025) report the UI
  prompting for card details, with a refundable $1 verification charge if provided. Source:
  web search of Render community/support threads, checked 2026-08-05. **Flagged as
  uncertain — verify directly at signup, don't assume either way.**
- **Assessment (not fact)**: the 15-minute Render spin-down window lines up closely with the
  existing 15-minute scoring cron cadence (`scripts/README.md:84`). If that job is
  redirected to ping the Render-hosted Python API at the same cadence, the service may
  rarely fully idle-out during active periods — this is a plausible mitigation for the
  cold-start caveat, not a confirmed behavior.

### Railway

- **Trial only, not a durable free tier**: new accounts get a one-time $5 credit valid for
  30 days, no card required to start. Source: web search + fetch of railway.com/pricing,
  checked 2026-08-05.
- **After the trial**: Railway's ongoing "Free" plan grants only **$1/month** in usage
  credit, described as suitable for a single lightweight service with no database. Source:
  web search of Railway free-tier articles, checked 2026-08-05. An always-on Python API
  process, even small, is likely to exceed $1/month in usage-based billing, pushing the
  account onto the $5/month Hobby plan.
- **Assessment (not fact)**: of the four options, Railway is the weakest fit for a durable
  $0 target — its "free" state is explicitly time-boxed (trial) or too small for continuous
  hosting (post-trial $1 credit).

---

## 3. Single-dyno packaging idea vs. two-process topologies

### Findings

- The packaging idea (one Heroku app: Python/FastAPI serves both the compiled static
  frontend via `StaticFiles` and the API) is described in
  `tickets/COLLABORATION_READINESS_EPIC.md:159-189` as a **park-and-explore** item, explicitly
  contingent on the frontend not depending on Next.js server features.
- **Cross-check against this repo's own evidence (§1)**: the app currently has no static
  export configured (`next.config.mjs` has no `output: 'export'`), keeps Next Image
  optimization on (`next.config.mjs:12-14`), runs 24 API routes under `app/api/**/route.ts`,
  and does per-request server-side auth in `middleware.ts:17-59`. All of this is real
  server-dependency surface. **This does not itself prove the app can't be adapted** — that
  determination (effort, and whether it's even worth it) is explicitly Task B's job
  (`tickets/CR-101-A-cost-hosting-analysis.md:47-48`) — but the repo evidence leans toward
  "constrained," not "trivially static-exportable," so the single-dyno idea should be read
  as **gated on Task B's finding**, not assumed available.
- No multi-buildpack config (e.g. `heroku-buildpack-multi`, `.buildpacks`) exists in the
  repo today; adopting the single-dyno idea would be new build-pipeline work, not a flip of
  an existing switch.

### Cost comparison (assuming the SSR constraint is eventually resolved)

- **Single Heroku dyno (packaging idea)**: one dyno, one bill — same dyno-tier cost as
  today's baseline (§1), likely **cost-neutral by definition** since it doesn't add a
  process. This is the cheapest topology in absolute Heroku-dollar terms *if and only if*
  Task B confirms it's technically viable without a costly rewrite.
- **Two Heroku process types (`web` + a second process) in one app**: Heroku's Eco dyno
  tier pools **1,000 dyno-hours/month across the whole account** at $5/mo (Heroku pricing
  page, checked 2026-08-05). One always-on process already consumes ~730 hours/month; a
  second always-on process would need ~1,460 hours combined, exceeding the shared Eco pool
  and forcing an upgrade to Basic dynos ($7/mo **each**, always-on, no pooling — Heroku
  pricing page, checked 2026-08-05). **Two always-on Heroku process types therefore costs
  roughly 2x–3x today's single-dyno baseline** (e.g., ~$14/mo for two Basic dynos vs. an
  assumed ~$5–7/mo baseline today), not cost-neutral.
- **Cloud Run API + static FE host**: if the frontend can be exported statically (same
  precondition as above) and hosted on a static host, and the API runs on Cloud Run within
  the free tier (§2), this topology could reach **$0 marginal added cost** for the backend
  and potentially eliminate the Heroku dyno spend entirely (replacing it with a static host,
  e.g. Cloud Storage+CDN in the same GCP project, or another free static host — not
  independently costed here, out of this ticket's explicit scope list). This is the
  theoretical cost floor, but carries more moving parts (CORS between origins, a second
  deploy pipeline) than the same-origin single-dyno idea, and shares the same SSR
  precondition gate.

---

## 4. Cost table — today vs. each candidate topology

| Topology | Monthly $ (est.) | Free-tier headroom | Cold-start / sleep caveat | Cost-neutral vs. baseline? |
|---|---|---|---|---|
| **Baseline (today)**: Heroku 1 dyno + Atlas | Unknown exact figure — **at least $5/mo** since Heroku free dynos were discontinued 2022-11-28 (tier unconfirmed, `Procfile:1` only shows one `web` process); Atlas tier/spend unconfirmed | N/A (baseline) | Depends on dyno tier (Eco sleeps after 30 min inactivity per Heroku pricing page, checked 2026-08-05; Basic+ is always-on) | N/A — this is the comparison point |
| **A. Cloud Run scale-to-zero, existing GCP project** (2nd runtime only, FE stays on Heroku) | ~$0 at this app's traffic level (2M req / 180k vCPU-s / 360k GiB-s free monthly, checked 2026-08-05) | Very large relative to a low-traffic family league + ~3,000 cron invocations/mo | Cold start on idle, low single-digit seconds typically; card/billing likely already on file via existing GCP project (unconfirmed) | **Cost-neutral / cost-adding $0** — adds a second runtime at no new provider cost, but total spend still includes unchanged Heroku + Atlas baseline |
| **B. Fly.io free allowance** (2nd runtime) | No true free tier for new accounts; ~$2–5/mo minimum once trial (≤7 days / 2 VM-hrs) ends, checked 2026-08-05 | Effectively none — trial is time/hour-boxed | N/A (paid, always-on) once trial ends | **Not cost-neutral** — small but nonzero recurring cost, plus a new vendor relationship |
| **C. Render free tier** (2nd runtime) | $0 within 750 hrs/mo on one free web service, checked 2026-08-05 | Ample for one low-traffic service | Spins down after 15 min idle; ~1 min cold start on wake (secondary sources; verify against render.com directly) | **Cost-neutral ($0)** if usage stays on one free service; cold-start is a real latency caveat for user-facing paths, less so for cron-triggered ones |
| **D. Railway free/trial tier** (2nd runtime) | $5 credit / 30-day trial only; ongoing "Free" plan is $1/mo credit, likely insufficient for an always-on API; realistic cost ~$5/mo (Hobby) after trial, checked 2026-08-05 | Effectively none beyond the 30-day trial | N/A | **Not cost-neutral** long-term — weakest of the four |
| **E. Single Heroku dyno, Python serves static FE + API** | Same as baseline dyno cost (no new process) — **gated on Task B confirming static-export feasibility** (repo evidence in §3 leans "constrained," not confirmed either way) | N/A | Same sleep/always-on behavior as whatever dyno tier is used | **Cost-neutral by construction if technically viable**; unresolved until Task B reports |
| **F. Two Heroku process types (web + API) in one app** | ~2–3x baseline: Eco pool (1,000 hrs/mo shared) is consumed by one always-on process alone (~730 hrs), so a second always-on process forces Basic dynos at $7/mo **each** | N/A | Both always-on if on Basic+ | **Not cost-neutral** — roughly doubles or triples dyno spend |
| **G. Cloud Run API + static FE host** | Theoretical $0 backend (per row A) + unpriced static-host cost (out of this ticket's scope) — could fully replace Heroku spend if static export is viable | Same as row A | Same as row A for the API; static host has its own cold-start profile (not researched here) | **Potentially cost-reducing**, but gated on the same SSR precondition as row E, plus adds CORS/deploy-pipeline complexity not present in row E |

---

## 5. Verdict — findings vs. assessment

**Findings (facts, cited above):**
- Cloud Run (existing GCP project) and Render both currently publish free tiers that
  comfortably cover this app's likely request volume, checked 2026-08-05.
- Fly.io and Railway do **not** currently offer a durable $0 tier for continuous hosting —
  both effectively require payment (Fly.io: ~$2–5/mo after a short trial; Railway: ~$5/mo
  Hobby after a 30-day trial), checked 2026-08-05.
- Today's baseline is not actually $0 either — Heroku's free dyno tier was discontinued
  2022-11-28, so the app is already paying at least $5/mo on the web dyno (exact tier
  unconfirmed).
- Doubling Heroku process types (two-process topology) costs roughly 2–3x the current
  single-dyno spend; the single-dyno packaging idea does not add dyno cost but is gated on
  an unresolved SSR-dependency question that this ticket explicitly defers to Task B.

**Assessment (this agent's read, not fact):**
- **No option is a hard "no free-tier fit exists"** — Cloud Run and Render both plausibly
  clear the "at/near $0" bar for this app's traffic profile. The primary axis (AC1) does
  **not** appear to force a no-go on cost grounds alone.
- Cloud Run inside the existing GCP project looks the strongest single candidate: it likely
  reuses billing/project setup that already exists for CR-004, avoids a new vendor
  relationship, and its free-tier headroom is generous relative to this app's scale — but
  this reuse-of-existing-billing assumption is inferred from the epic, not independently
  confirmed (see §4 open input).
- Render is a credible second candidate mainly because its cold-start caveat may be
  largely masked by the existing 15-minute scoring cron cadence, though that's a plausible
  mitigation, not a verified fact.
- Fly.io and Railway are weaker fits specifically because neither sustains a $0 state for
  continuous hosting under their 2026 pricing — they'd be viable only if the team is willing
  to accept a small (~$2–5/mo) recurring cost, which is a real option but not "at/near $0."

### Shortlist

1. **Cloud Run scale-to-zero, inside the existing GCP project.**
2. **Render free tier**, as a secondary/no-new-vendor-dependency-on-GCP option.

Neither is stated here as a final recommendation — that judgment, along with how it
interacts with Task B (effort), Task C (contract mechanism), and Task D (repo topology), is
explicitly reserved for the team's go/no-go (AC7), per this ticket's out-of-scope list.

---

## 6. Team-supplied inputs still needed

- **Current Heroku dyno tier** for the production app (Eco/Basic/Standard/etc.) — not
  discoverable from the repo; needed to compute the actual baseline $ figure in §4.
- **Current MongoDB Atlas plan/spend** (Free/M0, Flex, M2/M5, or M10+) — not discoverable
  from the repo; needed for the same reason.
- **GCP project ID and region(s)** used for the existing CR-004 scheduled jobs — needed to
  confirm (a) whether a billing account is already attached (affecting the Cloud Run
  card-requirement caveat) and (b) whether that project's region is one of the three
  Cloud-Run Always-Free regions (`us-central1`, `us-east1`, `us-west1`); if not, the
  "reuse the existing project" framing loses some of its simplicity advantage.
- **Actual/expected request volume** for a Python API serving this league (rough DAU/MAU
  and requests/day) — the headroom claims in §2/§4 assume a low-traffic family/friends
  league per the epic's own framing but are not independently measured against real usage.
