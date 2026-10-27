# Day 5 report — Status sync and message observability (2026-10-27)

## Implemented
- Branch `day-05-webhooks` from `main`; `main` untouched.
- **Adaptation (recorded):** the blueprint's signed-webhook verification
  assumes a provider that emits signed webhooks. The Mailmaan delivery
  service emits none for v1 sends, so an HMAC receiver would be
  unverifiable theater. Day 5 instead implements provider truth as
  read-back: upstream status sync with journaled, deduplicated provider
  events. Same proof obligation, honest evidence.
- **Status sync** (`src/lib/email/status-sync.ts`, `POST
  /v1/messages/:id/sync`, read scope): reads upstream status via the new
  `MailmaanDeliveryProvider.getMessageStatus`, journals every read into
  `webhook_events` (dedupe `sync:<provider_id>:<status>`), and applies
  genuine changes to the canonical timeline. Rules: upstream `sent`
  only *confirms* `accepted` (never sets `delivered_at` — it is an
  accept timestamp, not delivery proof); failure-family maps
  (`failed`/`bounced`/`complained`/`delivery_delayed`); unknown statuses,
  unknown (404) provider ids, and terminal states never move anything.
  Outcomes: `updated | confirmed | duplicate | ignored | unknown`.
- **Dashboard observability** (`src/lib/email/messages.ts`,
  `/dashboard/projects/[id]/messages`, `…/messages/[messageId]`, linked
  from the project list): newest-first activity list with honest status
  pills (“Accepted”, never “Delivered” without proof) and a detail page
  with headers, safe error, `queued/accepted/delivered(Unconfirmed)`
  timestamps, full timeline, and a Sync-from-provider action.
- `GET /v1/messages/:id` already shipped on Day 4; reused unchanged.

## Live verification (preview `mailmaan-regen-kgtmmzg4v`, deployed branch)
- Wrong-password send → `502 delivery_unavailable` in 10.5s; row
  `failed` with `error_code`, `failed_at` set, `accepted_at`/`delivered_at`
  null, `provider_message_id` null; timeline `queued → failed`. Truthful
  failure demonstrated end to end (probe project deleted afterwards).
- `POST …/96ab3593…/sync` → 200 `confirmed`, state stays `accepted`,
  `delivered_at` still null after sync (verified by query).
- `POST …/f0ea75d5…/sync` (pre-recording send) → 200 `unknown`,
  `upstream: null`, state unchanged.
- Invalid recipient → 422 `invalid_recipient`, no row written.

## Commands and tests actually run
- Unit: status-sync mapping/terminal (2 files), provider status incl.
  404→null and URL-encoding, message status labels — all pass
  (12 sync/provider + 4 messages incl. integration below).
- Integration (live Supabase, stub delivery/status): `sync.it.test.ts`
  2/2 (confirm-without-delivery-claim, dedupe→duplicate, bounce→updated
  + timeline, unknown writes nothing, provider-less message refused);
  `messages.it.test.ts` 1/1 (newest-first list, detail + timeline).
- `npm run typecheck` — clean. `npx eslint` on touched paths — clean.
  `npm run build` (unsandboxed; sandbox blocks Turbopack ports) — passes
  with `/api/v1/messages/[id]/sync` and both dashboard routes.
- Preview deploy + the five live checks above via authenticated preview
  HTTP. No email was dispatched by the failure test (upstream rejected
  auth before any send); no orphans left (probe project deleted).

## Acceptance criteria now satisfied
- Day 5 proof: provider reads update the timeline (bounce path tested
  live in integration, confirm/unknown paths tested live on preview),
  and neither API nor UI labels an unconfirmed send as delivered
  (`delivered_at` null everywhere; UI renders “Unconfirmed”).
- `GET /v1/messages/:id` + activity list + detail timeline shipped.
- Deliberate failure test shows the truthful failed outcome.

## Remaining risks and blockers
- No async delivery/bounce/complaint signals exist upstream; states past
  `accepted` arrive only via manual sync. A future signed-webhook
  producer (old-service instruction, unscheduled) would make this
  push-based; the journaling/dedupe/mapping layer is already shaped for it.
- Localhost HTTP testing remains environmentally blocked (proxy ~4s
  cutoff); preview is the live-test target.

## Next smallest step
- Owner review → merge `day-05-webhooks` to `main` → `vercel --prod`.
  Then Day 6 (event ingestion + workflows) per blueprint.
