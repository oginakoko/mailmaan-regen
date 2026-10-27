# Mailmaan — ten-day execution checklist (Blueprint §14)

## Day 1 — Establish the clean foundation
- [x] Create the new repository from scratch (`mailmaan-regen`, private)
- [x] Scaffold Next.js + TypeScript + Tailwind
- [x] Add environment validation, lint, type-check, test and build scripts
- [x] Create Supabase project (`mailmaan`, bgbtxtbjgybhzufoyvjn) + initial migrations
- [x] Configure local dev; minimal health route (`GET /v1/health`)
- [x] Architecture decision record + this checklist
- [x] Deploy the starter app to Vercel — https://mailmaan-regen.vercel.app

**End-of-day proof:** clean build + deployed starter app with `/v1/health`.

## Day 2 — Auth, project boundary and API credentials
- [x] Supabase SSR authentication
- [x] Project onboarding + brand profile storage
- [x] Secure one-time API key creation, hashing, scopes, revocation
- [x] RLS policies + database tests (cross-project isolation proof, 5/5 live)

## Day 3 — Template engine and AI generation
- [x] Template draft/publish/version + safe server-side rendering
- [x] Brand form + AI template-generation endpoint (clearly labelled fallbacks)
- [x] Soko `welcome` and `receipt` templates with previews
  (Note: real Muse generation unverified until `AI_API_KEY` +
  `AI_TEMPLATE_MODEL` are provided; fallback is labelled demo until then.
  See `docs/day-03-report.md`.)

## Day 4 — Real email send path (ADR-0002: delivery via the Mailmaan service)
- [x] Per-project SMTP config storage (encrypted at rest) + settings UI (masked)
- [x] `EmailProvider` interface + Mailmaan service adapter (`POST /v1/send`, Bearer `MAILMAAN_DELIVERY_*`; no other sender, ever)
- [x] `POST /v1/emails` with idempotency + durable queued state; sends blocked when SMTP unconfigured
- [x] Real test email proof to the designated test inbox; truthful status mapping (never claim `delivered` without evidence)
- [x] Old-service per-request SMTP + raw-HTML extension (PR #112) merged, deployed, verified live
  (Evidence: `docs/day-04-report.md`; inbox receipt confirmed by owner.)

## Day 5 — Webhooks and message observability
- [x] Message status read-back via `POST /v1/messages/:id/sync` (adaptation: no signed-webhook
  producer exists, so provider truth arrives by read-back; upstream `sent` only confirms `accepted`)
- [x] `GET /v1/messages/:id` (shipped Day 4) + activity/timeline UI + provider sync action
- [x] Controlled failure test shown truthfully (wrong-password send → 502 + `failed` timeline)
- [x] Old-service recording fixes (PRs #113/#114) merged, deployed, verified from both sides
  (Evidence: `docs/day-05-report.md`.)

## Day 6 — Event ingestion and workflows
- [x] `POST /v1/events` with idempotency + dispatch state (+ `POST /v1/events/reconcile`)
- [x] Workflow CRUD + matching (user.signed_up → welcome, order.paid → receipt, live proof)
- [x] Pending-event reconciler + delayed-run execution (synchronous architecture, no queue worker)
  (Evidence: `docs/day-06-report.md`; two live workflow emails accepted.)

## Day 7 — SDK and MCP
- [x] TypeScript SDK over the public API (`packages/sdk`, 6/6 tests, live demo proof)
- [x] `examples/soko-store` using the SDK server-side (+ MCP-driven invite integration, live proof)
- [x] Local stdio MCP server (6 tools) + `.mcp.json` agent config; machine proof over live stdio
  (Evidence: `docs/day-07-report.md`.)
- [x] Prod-build hotfix: Next typecheck scoped to the app; per-package checks via `typecheck:packages`

## Day 8 — End-to-end demonstration and diagnostics
- [x] Full journey walkthrough from setup to diagnosis (`tests/integration/journey.it.test.ts`,
  fresh project → key auth → template → SMTP → workflow → event → send → timeline → sync)
- [x] Request IDs persisted (messages, app events, queued-event payloads) and surfaced in
  API responses, dashboard detail, SDK types, and MCP diagnosis with log-correlation hints
- [x] Adversarial matrix live on preview: cross-project 404s, scope 401s, malformed/oversize/
  invalid inputs (400/413/422), duplicate-event replay, failed-send replay rule
  (Evidence: `docs/day-08-report.md`, this file's Day 8 section completion.)

## Day 9 — Hardening, deployment and regression tests
- [ ] Production-like webhook/retry/isolation tests; secret audit
- [ ] One-command local setup docs

## Day 10 — Freeze, polish and pitch
- [ ] Demo rehearsal from a fresh session; backup recording; seeded demo project
