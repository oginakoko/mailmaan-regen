# ADR-0001 — Mailmaan foundation stack (Day 1)

**Date:** 2026-10-26
**Status:** Accepted

## Context

Mailmaan is an AI-native email infrastructure platform being rebuilt from a
clean repository for a ten-day hackathon (see
`MAILMAAN_HACKATHON_MASTER_BLUEPRINT.md` in Documents). The product must let
an AI coding agent generate brand-matched templates, wire app events to
deterministic email workflows, send through one managed provider, and expose
truthful per-message delivery timelines with evidence-based diagnostics.

## Decision

- **Runtime:** Next.js 16 App Router + TypeScript (strict) + Tailwind CSS v4.
- **Data/auth:** Supabase (PostgreSQL + Auth) with committed SQL migrations
  under `supabase/migrations/`. RLS is enabled on every application table
  from Day 1; owner/dashboard policies land on Day 2.
- **Background work:** Inngest for durable sends and event workflows (from Day 4).
- **Delivery:** one managed provider adapter (Resend) behind an internal
  `EmailProvider` interface (from Day 4), plus signed-webhook handling (Day 5).
- **Agent surface:** TypeScript SDK (`packages/sdk`) and local stdio MCP
  server (`packages/mcp-server`) that call the same public API (Day 7).
- **Validation/testing:** Zod for all payloads; Vitest for unit tests;
  Playwright for one end-to-end journey (Day 9).
- **Hosting:** Vercel (app), Supabase Cloud (DB/auth), Inngest Cloud (jobs).

## Consequences

- One repo, one install command (`npm install`), one dev command (`npm run dev`).
- Message state is the source of truth: `queued → sending → accepted → delivered`
  (plus `failed`, `bounced`, `complained`, `delivery_delayed`, `suppressed`).
- Project identity always derives from the stored API-key record, never from
  a client-supplied `project_id`.
- Provider acceptance is never presented as inbox delivery.

## Day 1 scope actually delivered

Scaffold, env validation (`src/lib/env.ts`), Supabase SSR client wrappers,
`GET /v1/health`, initial migrations for projects/api_keys/templates/
messages/message_events (+ app_events/workflows/workflow_runs/webhook_events/
suppression_entries), ADR + checklist. Deployment to Vercel is pending CLI
login (see `docs/checklist.md`).
