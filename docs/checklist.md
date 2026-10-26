# Mailmaan — ten-day execution checklist (Blueprint §14)

## Day 1 — Establish the clean foundation
- [x] Create the new repository from scratch (`mailmaan-regen`, private)
- [x] Scaffold Next.js + TypeScript + Tailwind
- [x] Add environment validation, lint, type-check, test and build scripts
- [x] Create Supabase project (`mailmaan`, bgbtxtbjgybhzufoyvjn) + initial migrations
- [x] Configure local dev; minimal health route (`GET /v1/health`)
- [x] Architecture decision record + this checklist
- [ ] Deploy the starter app to Vercel (blocked: run `vercel login` first)

**End-of-day proof:** clean build + deployed starter app with `/v1/health`.

## Day 2 — Auth, project boundary and API credentials
- [ ] Supabase SSR authentication
- [ ] Project onboarding + brand profile storage
- [ ] Secure one-time API key creation, hashing, scopes, revocation
- [ ] RLS policies + database tests (cross-project isolation proof)

## Day 3 — Template engine and AI generation
- [ ] Template draft/publish/version + safe server-side rendering
- [ ] Brand form + AI template-generation endpoint (clearly labelled fallbacks)
- [ ] Soko `welcome` and `receipt` templates with previews

## Day 4 — Real email send path
- [ ] `EmailProvider` interface + Resend adapter
- [ ] `POST /v1/emails` with idempotency + durable queued state
- [ ] Inngest send function; real test email proof

## Day 5 — Webhooks and message observability
- [ ] Signed webhook verification, dedupe, canonical state mapping
- [ ] `GET /v1/messages/:id` + activity/timeline UI
- [ ] Controlled failure test shown truthfully

## Day 6 — Event ingestion and workflows
- [ ] `POST /v1/events` with idempotency + dispatch state
- [ ] Workflow CRUD + Inngest matching + pending-event reconciler
- [ ] `user.signed_up` → welcome, `order.paid` → receipt

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
