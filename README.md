# Mailmaan (regen) — email runtime for AI-built applications

Brand-matched templates, deterministic event workflows, managed delivery
through the Mailmaan service, and truthful message timelines — driven by
API key, TypeScript SDK, or MCP tools for coding agents.

Production: `https://mailmaan-regen.vercel.app` · Blueprint (canonical spec):
`MAILMAAN_HACKATHON_MASTER_BLUEPRINT.md` (Documents folder, outside this repo).

Integrating an app? Start with [`docs/developer-guide.md`](docs/developer-guide.md)
(5-minute setup, event design rules, agent/MCP path), the live
[Soko demo store](https://mailmaan-regen.vercel.app/demo/soko) and its
write-up [`docs/soko-demo.md`](docs/soko-demo.md), and the runnable
[`examples/soko-store`](examples/soko-store) reference.

## Architecture

- **Next.js + TypeScript app** (`src/`): public API (`/v1/*`), authenticated
  dashboard, server-only service layer.
- **Supabase/PostgreSQL**: projects, API keys (hashed, scoped), templates
  (draft/publish/version), per-project SMTP configs (AES-256-GCM),
  messages + event timelines, app events, workflows + runs.
- **Delivery**: deployed Mailmaan service (`POST /v1/send`) with per-request
  project SMTP + pre-rendered HTML. No other sender exists in this codebase
  (see `docs/adr/0002-mailmaan-delivery-and-smtp.md`). No queue worker:
  sends and workflow runs execute synchronously; delayed runs wait for the
  reconciler (`POST /v1/events/reconcile`).
- **Packages**: `packages/sdk` (typed client), `packages/mcp-server`
  (6 stdio tools for agents). **Example**: `examples/soko-store`.

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
| `MAILMAAN_TEST_RECIPIENTS` | Comma-separated allowlist; empty = unrestricted (keep restricted in prod) |
| `AI_API_KEY` / `AI_TEMPLATE_MODEL` (+`AI_BASE_URL`) | Optional Meta Muse generation; labelled fallback without |

Apply migrations in `supabase/migrations/` in order, then:

```bash
npm run typecheck && npm run lint && npm test   # unit + live integration (needs .env.local)
npm run build                                   # production bundle
vercel deploy --prod                            # after merging to main
```

Per-package checks: `npm run typecheck:packages`. Package READMEs cover
the SDK/MCP/example setup (`packages/mcp-server/README.md`,
`examples/soko-store/README.md`).

## Repo map

- `src/app/api/v1/` — `health`, `project`, `templates`, `emails`,
  `messages/[id]` (+ `/sync`), `events` (+ `/reconcile`)
- `src/app/dashboard/` — projects, templates, API keys, SMTP, messages,
  workflows (all owner-scoped, server actions)
- `src/lib/` — `api-keys`, `email` (render/provider/send/status-sync/messages),
  `smtp` (encryption/service), `supabase`, `templates`, `workflows`
- `supabase/migrations/` — schema in day order; `docs/adr/` — decisions;
  `docs/day-0N-report.md` — daily evidence; `docs/checklist.md` — ten-day tracker

## Conventions

- Feature branches (`day-0N-*`, `hotfix-*`); merge to `main` only after
  owner review. `main` is what deploys to production.
- Small reviewable changes with real test evidence. Never claim a test,
  deploy, delivery, or integration works unless verified (see daily reports).
- Truthful states only: `accepted` means provider-accepted, never delivered;
  failures persist with codes and timelines. Secrets never logged.
