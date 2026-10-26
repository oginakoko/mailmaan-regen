# Day 1 report — clean foundation (2026-10-26)

## Implemented
- New private repo `oginakoko/mailmaan-regen` (existing `mailmaan` repo left untouched), cloned to `~/Documents/my apps/mailmaan-regen`. All work on branch `day-01-foundation`; `main` untouched.
- Next.js 16.4.3 + TypeScript (strict) + Tailwind v4 scaffold (`create-next-app`, npm, turbopack, src-dir, `@/*` alias).
- Supabase clients: browser (publishable key) + SSR server client (`@supabase/ssr`), env validation with Zod (`src/lib/env.ts`) with lazy/server-only secret handling.
- Health endpoint: route handler at `/api/v1/health`, public alias `/v1/health` via `rewrites()` in `next.config.ts`. Returns `{status, version, timestamp}` only — no secrets or infra detail.
- Supabase schema migrated to the existing `mailmaan` project (eu-west-1): `projects`, `api_keys`, `templates`, `messages`, `message_events`, `app_events`, `workflows`, `workflow_runs`, `webhook_events`, `suppression_entries`. RLS enabled on all; API keys stored as hashes only; partial-unique idempotency indexes in place. Same SQL committed under `supabase/migrations/`.
- Docs: ADR-0001 + ten-day checklist under `docs/`; landing page honestly marked as Day 1 foundation.

## Commands and tests actually run
- `npm install` (+ `@supabase/ssr`, `@supabase/supabase-js`, `zod`, `vitest`, `@types/node@24` after resolving a real peer conflict — `@types/node` had to move from 20 to 24 for vitest 5).
- `npm run lint` → clean.
- `npm run typecheck` (`tsc --noEmit`) → clean (after replacing a fragile `package.json` import with a small version constant).
- `npm run test` (`vitest run`) → 3/3 passed (env validation: valid config, missing key, invalid URL).
- `npm run build` → compiled; routes `/` and `/api/v1/health` built.
- Production server smoke test + `curl`: `GET /v1/health` → 200 `{status:"ok","version":"0.1.0"}`; `GET /api/v1/health` → 200; `GET /` → 200, 8,410 bytes with the Mailmaan landing content. (Sandboxed curl to localhost once returned 000/empty-reply — an artifact of the shell sandbox, not the app; escalated curl confirms the real response.)

## Acceptance criteria now satisfied (Day 1)
- [x] Clean new repo, no code copied from any previous Mailmaan repo.
- [x] Next.js + TypeScript + Tailwind scaffold builds clean.
- [x] Environment validation (Zod), Supabase SSR clients, publishable key only in browser code.
- [x] Initial migrations committed and applied; RLS enabled; hash-only API keys.
- [x] `GET /v1/health` working and verified over HTTP on the production server.
- [x] ADR + day-by-day checklist committed.

## Remaining risks and blockers
- **Vercel deployment blocked:** `vercel whoami` → "The specified token is not valid". The Day 1 "deployed starter app" gate cannot be closed until you run `vercel login` (or provide a valid token). Local production server is verified; public deployment is not.
- `SUPABASE_SERVICE_ROLE_KEY` is empty locally (not available via the publishable-key path). Needed from Day 2; service-role must stay server-only.
- RLS has no dashboard/owner policies yet (Day 2 by design); until then the server path with the service key is the only data path — expected, documented in the migration header.

## Next smallest step
Day 2: Supabase SSR auth + project onboarding + secure one-time API key creation, with RLS policies and the cross-project isolation proof (two test projects cannot read each other's records).

## Working agreement
All work happens on feature branches (`day-01-foundation` now). `main` is only updated by merge after review.
