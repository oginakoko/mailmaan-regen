# Mailmaan — email runtime for AI-built applications

Brand-matched templates, deterministic event workflows, managed delivery,
and truthful message timelines — driven by API key, TypeScript SDK, or MCP
tools for coding agents.

**Live:** [app](https://mailmaan-regen.vercel.app) ·
[demo store](https://mailmaan-regen.vercel.app/demo/soko) ·
[docs](https://mailmaan-regen.vercel.app/docs) ·
[about](https://mailmaan-regen.vercel.app/about)

**Judges start here:** fly the [Soko demo](https://mailmaan-regen.vercel.app/demo/soko)
(checkout → five-minute delivery life → AI-written finale, all real emails),
then read [why it exists](https://mailmaan-regen.vercel.app/about) and the
[developer guide](https://mailmaan-regen.vercel.app/docs/developer-guide).

## What it does

- **AI drafts templates once** from a brand profile + one-line brief; a human
  publishes; every send reuses the frozen version. Per-user uniqueness comes
  from event data, never per-send generation.
- **Events drive workflows**: your app posts `{name, data}`; workflows match
  triggers, fill variables, and send through the project's own mailbox.
- **Delivery is managed** through the deployed Mailmaan service with
  per-request project SMTP — no shared mailbox, no second sender.
- **Timelines stay truthful**: `queued → accepted / failed`, synced back from
  the provider with evidence; failures persist with codes for diagnosis.
- **Agents get tools**: typed SDK plus 7 MCP tools (check, list, generate,
  send, track, read, diagnose) over the same API the dashboard uses.

## Architecture

- **Next.js + TypeScript app** (`src/`): public API (`/v1/*`), scroll-film
  landing, in-app docs, authenticated dashboard, server-only service layer.
- **Supabase/PostgreSQL**: projects, API keys (hashed, scoped), templates
  (draft/publish/version), per-project SMTP configs (AES-256-GCM),
  messages + event timelines, app events, workflows + runs.
- **Delivery**: deployed Mailmaan service (`POST /v1/send`) with per-request
  project SMTP + pre-rendered HTML. No other sender exists in this codebase
  (see `docs/adr/0002-mailmaan-delivery-and-smtp.md`). No queue worker:
  sends and workflow runs execute synchronously; delayed runs wait for the
  reconciler (`POST /v1/events/reconcile`).
- **Packages**: `packages/sdk` (typed client), `packages/mcp-server`
  (7 stdio tools for agents). **Example**: `examples/soko-store`.

## Setup

Prerequisites: Node 20+, a Supabase project, Vercel CLI (deploys).

```bash
npm install
cp .env.example .env.local   # then fill in (never commit)
```

Required server env (see `src/lib/env.ts` for the full schema):

| Variable | Purpose |
| -------- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase access |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only data path (never `NEXT_PUBLIC_`) |
| `MAILMAAN_DELIVERY_BASE_URL` / `MAILMAAN_DELIVERY_API_KEY` | Deployed Mailmaan service |
| `MAILMAAN_SMTP_ENCRYPTION_KEY` | 32-byte hex (`openssl rand -hex 32`); encrypts project SMTP passwords |
| `MAILMAAN_TEST_RECIPIENTS` | Optional allowlist; unset = unrestricted |
| `AI_API_KEY` / `AI_TEMPLATE_MODEL` (+`AI_BASE_URL`) | Optional Meta Muse generation; labelled fallback without |

Apply migrations in `supabase/migrations/` in order, then:

```bash
npm run typecheck && npm run lint && npm test   # unit + live integration (needs .env.local)
npm run build                                   # production bundle
vercel deploy --prod                            # after merging to main
```

Per-package checks: `npm run typecheck:packages`. Package READMEs cover
the SDK/MCP/example setup (`packages/sdk/README.md`,
`packages/mcp-server/README.md`, `examples/soko-store/README.md`).

Note: Vercel Preview environments need the same variables per branch
(the CLI's shared-preview path is unreliable) — add all ten when cutting a
branch or the preview build fails at prerender.

## Repo map

- `src/app/` — landing (`/`), `about`, `docs`, `demo/soko`, `login`,
  `dashboard` (owner-scoped, server actions), `api/v1/*`
- `src/components/` — `landing` (scroll-film), `ui` (dashboard kit:
  buttons, dialogs, fields, banners, skeletons, tabs)
- `src/lib/` — `api-keys`, `dashboard` (ownership gate, stats), `email`
  (render/provider/send/status-sync/messages), `smtp`
  (encryption/service), `supabase`, `templates`, `workflows`
- `supabase/migrations/` — schema in day order; `docs/adr/` — decisions;
  `docs/day-0N-report.md` — daily evidence; `docs/checklist.md` — tracker

## Conventions

- Feature branches; merge to `main` only after owner review **with a green
  preview**. `main` is what deploys to production.
- Small reviewable changes with real test evidence. Never claim a test,
  deploy, delivery, or integration works unless verified (see daily reports).
- Truthful states only: `accepted` means provider-accepted, never delivered;
  failures persist with codes and timelines. Secrets never logged.
