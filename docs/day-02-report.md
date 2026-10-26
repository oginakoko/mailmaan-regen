# Day 2 report — Auth, project boundary and API credentials (2026-10-26)

## Implemented
- Branch `day-02-auth` from `day-01-foundation`; `main` still untouched.
- **RLS policies migration** (`20261027000200_rls_policies.sql`, applied live):
  owner-scoped select/insert/update on `projects`; owner access to
  `templates`/`workflows` via project join; owner read-only on `messages`,
  `message_events`, `app_events`, `workflow_runs`, `webhook_events`,
  `suppression_entries`. `api_keys` deliberately has **no browser policies** —
  key hashes are unreachable from the browser, permanently.
- **Service-role client** (`src/lib/supabase/service.ts`): server-only,
  refuses to construct without `SUPABASE_SERVICE_ROLE_KEY`.
- **ApiKeyService** (`src/lib/api-keys/service.ts`): `mk_live_` keys with
  SHA-256 hash-only storage, one-time reveal, scopes (`read`/`send`/`events`,
  possessions imply `read`), revocation, constant-time hash comparison,
  project identity derived from the stored key record — never from client input.
- **Session plumbing**: `src/proxy.ts` (Next.js 16 name for middleware)
  refreshes the Supabase cookie and guards `/dashboard`; `/login` with
  Server-Action sign-in/sign-up; protected workspace `/dashboard` (project
  list + creation with brand profile and sender defaults); API-key console
  `/dashboard/projects/[projectId]/keys` (create with scopes, one-time reveal
  banner, revoke).
- **Public API**: `GET /v1/project` (Blueprint §7) — Bearer API-key auth,
  `read` scope, minimal project payload, Blueprint error envelope.
- **Maintained tests:** `env.test.ts` (3), `api-keys/service.test.ts` (2),
  `api/v1/project/route.test.ts` (2, fail-closed gate). Live procedure
  documented below and in `docs/checklist.md` Day 2.

## Commands and tests actually run
- `npm run lint` → clean. `npm run typecheck` → clean.
- `npm run test` → **7/7 passed** (3 files).
- `npm run build` → compiled; routes `/`, `/api/v1/health`, `/api/v1/project`,
  `/dashboard`, `/dashboard/projects/[projectId]/keys`, `/login` + proxy.
- Production server (port 3104) + `curl`:
  - `GET /v1/health` → 200.
  - `GET /v1/project` no key → 401 `invalid_api_key` (Blueprint envelope).
  - `GET /v1/project` bad key → 401 `invalid_api_key` (after service-key fix, below).
  - `GET /dashboard` unauthenticated → 307 to `/login?next=%2Fdashboard`.
  - `GET /login` → renders "Sign in to Mailmaan".
- **Live isolation proof** (real Supabase project, real production server,
  two throwaway Auth users + two projects + one real API key):
  - PASS — A's key resolves to project A over `/v1/project` (HTTP 200).
  - PASS — user B cannot read project A through the publishable path (RLS, 0 rows).
  - PASS — user A sees exactly their own project (1 row).
  - PASS — browser can never read `api_keys` (0 rows, no policies by design).
  - PASS — revoked key is rejected (HTTP 401).
  Probe script deleted after the run; probe accounts/projects remain in the
  Supabase project for audit (clearly named `mailmaan-*@example.invalid` /
  `iso-*` slugs). No real email was sent. No secrets were printed or committed.

## Defect found and fixed during verification
- First probe of `/v1/project` with a malformed-but-well-formed key returned
  **500 `internal_error`** instead of 401: `SUPABASE_SERVICE_ROLE_KEY` was
  empty locally, so the service client could not be constructed. Fixed by
  provisioning the real secret key into `.env.local` (server-only, never
  committed) via the Supabase management API. Retest: bad key → 401, as specced.
  Recorded so the same failure is recognizable in deployment (Blueprint §17:
  server-only secrets must be provisioned before key auth can work).

## Day 2 acceptance criteria (Blueprint §14)
- [x] Supabase SSR authentication (proxy session refresh + login + guards).
- [x] Project onboarding and brand profile storage.
- [x] Secure one-time key creation, hashing, scopes and revocation.
- [x] RLS policies + database tests.
- [x] API-key auth helper deriving project identity from the hashed record.
- [x] **Proof:** two test projects cannot read each other's records; an API
  key authenticates only to its own project (see live proof above).

## Remaining risks and blockers
- Vercel deployment still blocked on `vercel login` (Day 1 carry-over).
- Probe Auth users/projects remain in the Supabase project (audit trail, not
  production data). Delete them from the Supabase dashboard if unwanted.
- Dashboard pages stream under `<Suspense>` (Next 16 cache components);
  no visual polish yet — function-first per Blueprint §13.
- `sender_configured` in `/v1/project` is hardcoded `false` until Resend
  sender configuration lands on Day 4.

## Next smallest step
Day 3: template engine + AI generation — schema/publish/version actions,
safe server-side rendering with sample variables, brand form, generation
endpoint (with clearly labelled deterministic fallbacks), Soko `welcome`
and `receipt` templates.
