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
- [ ] Per-project SMTP config storage (encrypted at rest) + settings UI (masked)
- [ ] `EmailProvider` interface + Mailmaan service adapter (`POST /v1/send`, Bearer `MAILMAAN_DELIVERY_*`; no other sender, ever)
- [ ] `POST /v1/emails` with idempotency + durable queued state; sends blocked when SMTP unconfigured
- [ ] Real test email proof to the designated test inbox; truthful status mapping (never claim `delivered` without evidence)

## Day 5 — Webhooks and message observability
- [ ] Message status read-back (only if the Mailmaan service exposes it; otherwise `accepted` is the last claimable state)
- [ ] `GET /v1/messages/:id` + activity/timeline UI
- [ ] Controlled failure test shown truthfully

## Day 6 — Event ingestion and workflows
- [ ] `POST /v1/events` with idempotency + dispatch state
- [ ] Workflow CRUD + matching (user.signed_up → welcome, order.paid → receipt)
- [ ] Pending-event reconciler

## Day 7 — SDK and MCP
- [ ] TypeScript SDK over the public API
- [ ] `examples/soko-store` using the SDK server-side
- [ ] Local stdio MCP server; agent integration proof

## Day 8 — End-to-end demonstration and diagnostics
- [ ] Full journey walkthrough from setup to diagnosis
- [ ] Diagnostics grounded in stored evidence; core test matrix green

## Day 9 — Hardening, deployment and regression tests
- [ ] Production-like webhook/retry/isolation tests; secret audit
- [ ] One-command local setup docs

## Day 10 — Freeze, polish and pitch
- [ ] Demo rehearsal from a fresh session; backup recording; seeded demo project
