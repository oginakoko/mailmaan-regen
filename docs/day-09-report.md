# Day 9 Report — Hardening: rate limits, suppression, recovery, audit

Branch: `day-09-hardening` → merge to `main` only after owner review.
Status: code complete, all gates green, prod sweep green. Preview live
probe is blocked on the Vercel SSO bypass secret (see §7).

## 1. What was implemented

- **DB-backed fixed-window rate limiting** (`src/lib/rate-limit/service.ts`,
  `supabase/migrations/20261027000600_rate_limits.sql`): read 600/min,
  write 120/min, atomic `api_rate_limit_bump` RPC, 429 + `Retry-After`
  via `enforceRateLimit` on every v1 route, fail-open if the counter
  store is down.
- **Suppression enforcement** (`src/lib/suppression/service.ts`,
  `src/lib/email/send.ts`): suppressed recipients get a stored
  `suppressed` message + timeline event; the provider is never called.
  Seed/normalize helpers, idempotent upsert on
  `(project_id, recipient_email)`.
- **Auto-suppress on bounce/complaint** (`src/lib/email/status-sync.ts`):
  status sync writes a suppression entry (reason `hard_bounce` /
  `complaint`, linked to the source message). Plain failures do not
  suppress (may be transient or credential issues).
- **Stuck-run recovery** (`src/lib/workflows/service.ts`):
  `reconcileProject` resets runs stuck `running` for 15+ min back to
  `queued` and executes them directly (due by construction), returning
  `runs_reset`. The stable `wf:<run_id>` send key keeps re-execution
  single-send. SDK `reconcileEvents()` type updated.
- **RPC lockdown** (`supabase/migrations/20261027000700_*.sql`, audit
  fix): `api_rate_limit_bump` is now `service_role`-only with a fixed
  `search_path`, and the old-window sweep is anchored to `now()`.
- **FK indexes** (`supabase/migrations/20261027000800_*.sql`): 7 covering
  indexes from the performance advisor, no behavior change.

## 2. Commands and tests actually run (results)

- `npm run lint` — clean. `npm run typecheck` — clean.
- `npm test` — **100/100 unit pass** (28 files).
- `npx vitest run tests/integration` — **18/18 pass** (10 files),
  twice consecutively, against the real Supabase project with stub
  delivery (no email dispatched, no upstream contacted):
  - `suppression.it.test.ts` (new, 3 tests): suppressed send stored
    with zero provider calls; bounce → auto-suppressed → next send
    blocked; stuck run reset + executed exactly once
    (`runs_reset: 1, runs_executed: 1`, provider calls 1). Passed 3
    consecutive runs (rerun-stability proof).
  - Full-suite reruns also cover templates/smtp/emails/sync/messages/
    workflows/request-ids/journey/rate-limit.
- `vercel deploy` (branch preview) — builds and serves after adding
  branch-scoped Preview env vars:
  `https://mailmaan-regen-382a5s7tg-philip-oginas-projects.vercel.app`
- Anon REST probe of `api_rate_limit_bump` — **401** `permission denied
  for function` (was 200 before the lockdown).
- Prod sweep (`https://mailmaan-regen.vercel.app`, unaffected `main`):
  `GET /v1/health` → 200; `GET /v1/templates` valid key → 200
  `{"templates":[]}`; bad key → 401 with `request_id`;
  `POST /v1/events/reconcile` → 200
  `{"events_reconciled":0,"runs_executed":0}` (no `runs_reset` — prod
  still runs pre-Day-9 code, as expected).

## 3. Bugs found and fixed during Day 9

1. **Reconciler never executed stuck runs (real bug).** Reset set
   `queued`, but the due scan compared app-clock `now` against DB
   `created_at`; ~90 ms DB clock skew parked freshly reset runs.
   Evidence: `DUE-DEBUG` showed `created_at` 90 ms after `now`.
   Fix: execute reset runs directly (they passed the due gate when
   first claimed). Without this, one reconcile pass left runs parked
   in `queued` forever (no cron exists yet).
2. **Sync-journal rerun collisions (test design).** `webhook_events`
   rows survive probe-project deletion (audit trail, `on delete set
   null`), and the `(provider, provider_event_id)` unique key made
   fixed stub ids (`<supp-stub-1@example>`…) return `duplicate` on
   reruns. Fix: per-run unique stub ids in suppression/sync/journey
   suites; one-time delete of 4 orphaned probe rows.
3. **Rate-limit boundary flake (test design).** Fixed epoch windows let
   two live-clock calls straddle a minute boundary. Fix: pin the
   test's calls to mid-window with `opts.now` and assert the exact
   `resetAt`. First full-suite run caught it (1/18 failed); green
   since.
4. **Anon-executable rate-limit RPC (security, advisor WARN).**
   `api_rate_limit_bump` was callable by anon/authenticated, and the
   sweep trusted the caller-supplied window — a future `p_window_start`
   wiped all current windows (rate-limit bypass). Fix: explicit
   `revoke … from anon, authenticated, public` + grant to
   `service_role` only, `set search_path = ''`, sweep on `now()`.
   Note: a bare `from public` revoke did NOT remove the direct anon/
   authenticated grants — verified via `routine_privileges`, then
   re-probed to 401.
5. **Test allowlist ordering.** The send boundary checks
   `MAILMAAN_TEST_RECIPIENTS` before suppression, so the suppressed-
   send test uses an allowlisted address (mixed-case seed keeps the
   normalization assertion).

## 4. Secret/logging audit (findings)

Checked: all `console.*` in `src`, error-response shapes, SMTP/API-key
returns, provider auth, RLS coverage, committed secrets, public env,
dashboard data flow, Supabase security + performance advisors.

- Logging is (code, request_id) only; unknown-error detail stays
  server-side while clients get a generic message. No request bodies,
  SMTP values, or keys are logged.
- SMTP dashboard/service returns masked summaries (`se***@example.com`);
  the password is selected only on the decrypt-for-send path.
- API keys: raw key revealed once at creation, sha256 + timing-safe
  compare, prefix-pinned (`mk_live_`).
- Provider auth via `Authorization: Bearer` header (never URL);
  per-request SMTP travels in the HTTPS POST body by design.
- `.env.local` untracked, no history; no hardcoded secrets in repo
  (only a redacted `mm_mvp…` mention in ADR-0002).
- `NEXT_PUBLIC_*` limited to Supabase URL, publishable key, app URL.
- RLS enabled on all 12 tables; owner-scoped policies for user reads;
  `api_keys`, `project_smtp_configs`, `api_rate_limits` are intentional
  deny-all (service-role via server actions only) — advisor INFO,
  documented, kept.
- Advisors after fixes: security WARNs cleared except **leaked-password
  protection (Auth dashboard toggle — owner action)**; performance
  FK warnings cleared with §1 indexes (3 "unused index" INFOs kept —
  real query paths, low traffic).

Audit follow-ups (accepted, low): raw API key travels once via the
`?created=` redirect URL (revocable, project-scoped); no manual
suppression UI yet (documented gap).

## 5. Acceptance criteria now satisfied

- Per-key/per-bucket allow/deny accounting with window rollover
  (integration-proven, rerun-stable).
- Suppressed recipients never reach the provider; bounces/complaints
  auto-suppress; next send blocked (integration-proven).
- Stuck runs reset and executed exactly once per reconcile
  (integration-proven, skew-immune).
- Security advisors clean except one owner dashboard toggle;
  anon RPC path closed (live-probed 401).
- Full regression green: 100 unit + 18 integration, lint, typecheck.
- Prod (`main`) verified unaffected by the shared-DB changes.

## 6. Remaining risks and blockers

- Preview live-route proof (HTTP 429 + `runs_reset` over the wire)
  needs the Vercel Protection Bypass secret — asked below.
- No cron for the reconciler/delayed runs (unchanged, Day 10?).
- No manual suppression UI (documented gap).
- Shared-DB note: Day 9 migrations (RPC lockdown, FK indexes) are
  already applied to the linked Supabase project; prod code paths
  using them (rate-limit RPC via service role) verified working.
- Probe residue: `day9-sweep` project + key exist until the sweep
  finishes, then deleted. Older probe projects (`iso-*`,
  `day4-live-send`, `mailmaan-*@example.invalid` users) kept for audit.

## 7. Next smallest steps

1. Owner pastes the Vercel Protection Bypass secret (project Settings
   → Deployment Protection → Protection Bypass for Automation).
2. I run the preview sweep (health, `runs_reset` shape, 121-event
   429 + `Retry-After`), delete the sweep project/key, and push the
   report update.
3. Review `day-09-hardening` → merge → `vercel --prod`.
