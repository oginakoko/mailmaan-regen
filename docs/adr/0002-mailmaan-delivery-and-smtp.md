# ADR-0002 — Delivery via the Mailmaan service; per-project SMTP (Day 4)

**Date:** 2026-10-26
**Status:** Accepted (product-owner decision; supersedes the Resend/Inngest plan in ADR-0001 for delivery only)

## Decision (product owner, verbatim intent)

Delivery for the new Mailmaan (`mailmaan-regen`) runs through the **existing
deployed Mailmaan service** (`https://mailmaan.vercel.app`) using its API key
model, exactly like Gaphytoro does (`MAILMAAN_BASE_URL` + `MAILMAAN_API_KEY`,
`POST /v1/send` with `Authorization: Bearer [REDACTED] This is
integration with a live service — **no code is copied, vendored, or imported**
from any previous Mailmaan repository. No other sender (Resend, SMTP-direct,
etc.) will be introduced.

Templates are authored and versioned in this app and rendered locally at
send time (sanitized, schema-validated). The old service is the delivery
truth: it transmits the rendered bytes through the caller's per-request
SMTP mailbox via its raw-HTML mode, exactly like Gaphytoro's template
sends. If the old service lacks a capability the new product needs, the
old service is what gets extended (its own GitHub → `main` → Vercel
auto-deploy).

## Verified live evidence (2026-10-26, read-only probes)

- `GET /v1/health` → `200 {"status":"ok","service":"mailmaan"}`.
- Both the project API key (`mm_mvp…`, never logged in full) and Gaphytoro's
  production key authenticate on `POST /v1/send`; both correctly reject an
  unknown template with `Template "<id>" was not found`.
- `/v1/send` enforces per-project template isolation: Gaphytoro's
  `welcome-email` slug is **not** visible to this project's key.
- `POST /api/send-trigger-email` returns **405** on the deployed service today
  (Gaphytoro's local copy may be ahead of the deploy); `/v1/send` is the
  deployed canonical send path. All delivery work targets the deployed API.
- Read-back: no per-message status JSON endpoint was found (`/api/messages`,
  `/api/emails`, `/api/stats` return the SPA shell). Until one exists, the new
  app may only claim `queued → accepted/sent` from the API response and must
  never claim `delivered`.

## SMTP sender identity (hard requirement)

Every end user of the new Mailmaan must send from **their own** SMTP account,
never from the platform owner's mailbox connected to the old service.
Therefore, before any production send:

1. Each project stores its own SMTP credentials in this app, **encrypted at
   rest** (AES-256-GCM, `MAILMAAN_SMTP_ENCRYPTION_KEY` server-only) in a new
   `project_smtp_configs` table; the password is never returned to the browser
   after save (UI shows `configured: yes/no` + from address only).
2. The send call passes that project's SMTP credentials to the Mailmaan
   service per request over HTTPS. Passing passwords per request keeps the
   old service stateless for our callers; plaintext exists only in memory
   during the call.
3. The old service must accept a per-request SMTP override. If the deployed
   API lacks it today, that support is added to the old service first
   (its repo → `main` → Vercel), and the new app blocks sends for projects
   without SMTP configured rather than ever silently falling back to the
   owner's sender.

## Consequences

- Day 4 shrinks to: `EmailProvider` (Mailmaan implementation only) +
  `POST /v1/emails` in this app with our API-key auth + DB idempotency +
  status mapping + timeout handling, and the SMTP config storage above.
  No Inngest app, no provider signup/domain verification in this repo.
- Our `messages`/`message_events` tables remain the source of truth for our
  users; we persist the old service's `message_id` as `provider_message_id`.
- Risks: the old service is a single point of failure for delivery (accepted
  by the product owner); its rate limits and template-management API surface
  must be verified during Day 4; per-request SMTP pass-through means SMTP
  passwords transit our server on every send (TLS + no logging mitigates).

## Day 4 sequence

1. Confirm the old service's per-request SMTP contract (probes only).
2. `project_smtp_configs` migration + settings UI (masked, encrypted).
3. Mailmaan `EmailProvider` + `POST /v1/emails` + idempotency + status map.
4. One real send to `philipstar98@gmail.com` (user-designated test inbox);
   report the actual API result. No delivery claim beyond what it returns.

## Deployment record — per-request SMTP + raw HTML (2026-10-26)

- Old-service PR `oginakoko/mailmaan#112` (`feat/v1-send-smtp-html-override`)
  merged to `main` (merge commit `d749bfd`, feature commit `5d10b87`).
  Vercel production deploy succeeded; no DB migration needed.
- Live verification after deploy (validation probes only, nothing dispatched):
  - `GET /v1/health` → 200 (verified by old-service agent).
  - Authenticated `POST /v1/send` with `smtp: {"host": ""}` →
    422 `` `smtp.host` is required `` — new code confirmed live.
  - Authenticated `POST /v1/send` with `html` and no subject →
    400 `` `subject` is required when sending raw `html` ``.
  - A live send through the new fields has NOT been verified yet; the
    first real send happens in step 4 above via this app.

## Residual risks (recorded explicitly per review)

- **Arbitrary SMTP endpoints.** A valid API key lets the holder point
  `smtp.host`/`smtp.port` at any reachable server, not just their own
  provider. Accepted as inherent to user-supplied SMTP; the trust anchor
  is the API key. Mitigations to consider in the old service: per-key
  rate limits on `/v1/send`, and audit logging of host/port (never
  credentials) per send.
- **`smtp.secure` coercion.** The merged code uses `Boolean(...)`, so a
  JSON string `"false"` would become `true`. This app always sends a real
  boolean; a strict-validation fix has been requested from the
  old-service agent (follow-up instruction, not blocking).
- **Old-repo suite health.** The old repo's full Vitest suite reports
  27 failures; they were not baselined against pre-merge `main`.
  Focused transactional tests (6/6) and typecheck pass. Baselining
  requested from the old-service agent.
