# Day 4 report — Delivery via Mailmaan + per-project SMTP (2026-10-27)

## Implemented
- Branch `day-04-send`; `main` untouched. Pivot per owner + ADR-0002:
  delivery runs through the deployed Mailmaan service (`POST /v1/send`),
  Resend/Inngest descoped. No old-repo code copied, vendored, or imported.
- **Contract confirmation (read-only probes):** deployed `/v1/send` accepted
  only `{to, from, subject, template_id, variables}` and always sent through
  the key owner's stored mailbox — no per-request SMTP, no raw HTML.
  Verified live (401/400/404 shapes) and against `oginakoko/mailmaan` main.
- **Old-service extension (shipped via PR #112, merged by old-service agent):**
  optional `smtp {host, port, secure, user, pass, from_email, from_name}`
  used in memory only, plus raw `html`/`text` mode so callers send
  pre-rendered bytes without mirroring templates. Validated live after
  deploy: bad `smtp` → 422, `html` without subject → 400, nothing dispatched.
- **Per-project SMTP storage** (`supabase/migrations/20261027000300_project_smtp.sql`,
  `src/lib/smtp/encryption.ts`, `src/lib/smtp/service.ts`): one mailbox per
  project, AES-256-GCM envelopes (`v1:` + base64url), RLS on with zero browser
  policies (service-role routes only, same model as `api_keys`). Dashboard
  page shows masked user/host/from; password never readable back; blank keeps
  stored; delete blocks sends. Send path throws `SmtpNotConfiguredError` —
  never falls back to a shared mailbox.
- **Delivery provider** (`src/lib/email/provider.ts`): single
  `MailmaanDeliveryProvider` implementation, 30s timeout, typed errors with
  retryable flags, secrets never logged. `messages.provider` default flipped
  to `mailmaan` (`.../20261027000400_provider_mailmaan.sql`).
- **Send pipeline** (`src/lib/email/send.ts`, `POST /v1/emails`, `GET
  /v1/messages/:id`): send scope + `Idempotency-Key` header → 202
  `{id, status, status_url, replayed}`. Validate → published template →
  schema-checked sanitized render → project SMTP → queued row → deliver →
  accepted/failed with `queued → accepted/failed` timeline events. Same key +
  same body replays without re-sending; same key + different body → 422;
  races resolve as replays. `MAILMAAN_TEST_RECIPIENTS` allowlist guardrail.

## First real email (verified, not claimed)
- `POST /v1/emails` (Vercel preview, deployed branch code) →
  `202 {status: accepted, provider_message_id:
  <f4d333d5-86d3-be0e-b24b-d2f96544490f@gaphytoro.com>}` in 19.2s.
- From `noreply@gaphytoro.com` (project Zoho mailbox via per-request SMTP)
  to `philipstar98@gmail.com`. **Owner confirmed receipt in inbox.**
- Timeline `GET /v1/messages/f0ea75d5…`: `queued → accepted`, no secrets.
- Replay of `day4-live-2` → `replayed: true`, same id, still 2 events —
  no second SMTP send.
- Honest failure also proven: first attempt with the base64-encoded password
  (copied from old-Mailmaan storage, which transparently decodes legacy
  base64 at send time) failed with Zoho `535 EAUTH`; pipeline returned 502
  and persisted `failed` + timeline. Decoded password `@Philomgaza1`
  re-stored; retry accepted.

## Commands and tests actually run
- `npx vitest run src/lib/smtp src/lib/email` — 27/27 unit pass
  (encryption round-trip/tamper/wrong-key, validators, provider stub incl.
  timeout abort, hash stability, allowlist).
- `tests/integration/smtp.it.test.ts` — 1/1 live (masked round-trip,
  blank-keeps-password, decrypt-on-send-path only, 0 orphans).
- `tests/integration/emails.it.test.ts` — 3/3 live with stub provider
  (send-once + replay + key-reuse rejection + honest failure persistence).
  One run flaked on slow Supabase network (timeout); rerun green in 12s;
  orphan probe project deleted.
- `npm run typecheck` — clean. `npx eslint` on touched paths — clean.
  `npm run build` — passes (must run unsandboxed: macOS sandbox blocks
  Turbopack worker port-binding; pre-existing environmental issue).
- Live probes: old-service 422/400 validation (new code confirmed on prod),
  preview `POST /v1/emails` 202 + timeline + replay as above.
- Old-service note: `GET /v1/messages/<id>/status` returns 404 for the
  raw-HTML send — its `sent_emails` row write/read-back looks broken for the
  new mode. Follow-up issued to the old-service agent; our accepted state
  comes from the send response, unaffected.

## Acceptance criteria now satisfied
- Day 4 proof: one durable message + one real email + idempotent replay —
  all verified against deployed systems with evidence above.
- Per-project SMTP required and encrypted; owner mailbox never used.
- Truthful states only: `queued → accepted/failed`; no `delivered` claim.

## Remaining risks and blockers
- Old service is the single point of failure (accepted by owner).
- Residual risks recorded in ADR-0002: arbitrary SMTP endpoints per key
  (inherent; rate-limit/audit mitigations suggested), `smtp.secure`
  Boolean coercion (fix requested), old-repo suite baselining (requested),
  plus the new status-read-back 404 for raw-HTML sends (requested).
- Localhost HTTP testing is environmentally blocked (proxy kills responses
  slower than ~4s); deployed preview is the live-test target until Day 5+.

## Next smallest step
- Day 5 per blueprint (events/workflows), or owner review → merge
  `day-04-send` to `main` → promote preview env to production.
