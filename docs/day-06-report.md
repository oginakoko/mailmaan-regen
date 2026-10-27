# Day 6 report — Event ingestion and workflows (2026-10-27)

## Implemented
- Branch `day-06-workflows` from `main`; `main` untouched.
- **Adaptation (recorded):** the blueprint's Inngest background delivery
  does not exist in this architecture (ADR-0002). Execution is
  synchronous: ingest persists, matches, and executes due runs inline;
  delayed runs stay `queued` until the reconciler executes them past due.
  One run per (workflow, event) is enforced by unique constraint, and
  every run sends with the stable key `wf:<run_id>`, so retries and
  reconciliations never double-send.
- **Pure evaluation core** (`src/lib/workflows/paths.ts`): safe dot-path
  reads over `{id, name, data}`, `exists`/`equals` conditions (max 10),
  path-or-constant variable mappings (max 50). No code execution; hostile
  paths resolve to `undefined`, never throw.
- **Engine** (`src/lib/workflows/service.ts`): `ingestEvent` (name/payload
  validation, 64KB cap, external-id replay without re-trigger, 10-workflow
  match cap), `executeRun` (claim Guard queued→running, conditions→
  `skipped`, published-template/recipient/variables resolution with
  `failed` reasons, send via the Day-4 pipeline), `reconcileProject`
  (replays `pending` events, executes due delayed runs; safe to repeat),
  and dashboard CRUD (create/update with version bumps, delete cascades
  runs). Run-version note: the table constrains one run per
  (workflow, event) regardless of workflow version (documented deviation
  from the blueprint's (workflow, event, version) ideal).
- **Public API:** `POST /v1/events` (events scope → 202
  `{id, dispatch_status, replayed, runs}`), `POST /v1/events/reconcile`
  (events scope → `{events_reconciled, runs_executed}`).
- **Dashboard CRUD** (`…/workflows`, `…/workflows/[workflowId]`, linked
  from the project list): list with enable/disable + delete, create form
  (trigger, published-template picker, recipient path, conditions/mappings
  JSON, delay, enabled), prefilled edit page.
- **Demo wiring** on `day4-live-send` (kept for the judge flow):
  `user.signed_up` → `welcome`, `order.paid` → `receipt`, both enabled.

## Live verification (preview `mailmaan-regen-1mgden73j`, deployed branch)
- `user.signed_up` (`day6-signup-1`) → 202 `dispatched`, run `completed`,
  message `accepted`, subject “Welcome to Soko, Philip!” — real email sent.
- `order.paid` (`day6-order-1`) → 202 `dispatched`, run `completed`,
  message `accepted`, subject “Receipt for order ORD-1001” — real email sent.
- Replay of `day6-signup-1` → `replayed: true`, same event/run/message,
  no second send.
- Both messages verified `accepted` in Supabase with correct recipients
  and rendered subjects.

## Commands and tests actually run
- Unit: paths (9/9: reads, hostile paths, conditions, mappings, save-time
  rejection).
- Integration (live Supabase, stub delivery): `workflows.it.test.ts`
  3/3 (ingest→match→send-once + idempotent replay with rendered-subject
  check; condition-mismatch skip + bad-name/bad-data/bad-template
  rejection with zero sends; delayed run held → early reconcile no-op →
  past-due reconcile executes exactly once). Fixed two real bugs found
  by the suite: terminal run summaries returned stale null codes, and a
  `prefer-const` lint error.
- `npm run typecheck` — clean. `npx eslint` on touched paths — clean.
  `npm run build` (unsandboxed) — passes with `/api/v1/events`,
  `/api/v1/events/reconcile`, and both workflow dashboard routes.
- Preview deploy + the three live event checks above (two real emails to
  the designated test inbox, one replay with no send).

## Acceptance criteria now satisfied
- Day 6 proof: a test app event causes the correct published template to
  be queued and sent exactly once — demonstrated live for both demo
  workflows, with replay safety.
- Workflows tables + dashboard CRUD + run persistence + pending-event
  reconciler shipped; `user.signed_up` → welcome and `order.paid` →
  receipt configured and enabled.

## Remaining risks and blockers
- Delayed runs need the reconciler invoked (no cron wired); queued runs
  wait honestly until then. A Vercel cron hitting the reconcile endpoint
  per project (or one internal sweep) is the natural Day 8+ hardening.
- Suppression list is still unenforced anywhere in the send path
  (pre-existing Day-4 gap, unchanged).
- Localhost HTTP testing remains environmentally blocked; preview is the
  live-test target.

## Next smallest step
- Owner review → merge `day-06-workflows` to `main` → `vercel --prod`.
  Then Day 7 (TypeScript SDK + soko-store example + MCP server).
