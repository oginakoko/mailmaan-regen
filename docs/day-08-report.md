# Day 8 report — End-to-end demonstration and diagnostics (2026-10-27)

## Implemented
- Branch `day-08-e2e` from `main`; `main` untouched.
- **Request-ID evidence trail** (migration `20261027000500_request_ids`,
  indexed): API routes mint a request id that persists onto messages,
  app events, and queued-event payloads — including into workflow-run
  sends (event id flows through `executeRun`). Surfaced in `GET
  /v1/messages/:id`, the dashboard detail page, the SDK `MessageDetail`
  type, and MCP `diagnose_message` output with a log-correlation hint.
- **Fresh-setup journey** (`tests/integration/journey.it.test.ts`): empty
  project → real key creation + authentication → draft→publish →
  SMTP config → workflow → event → completed run → accepted message →
  timeline → upstream sync confirm. Passes live in ~11s.
- **Adversarial matrix** (10 probes, live on preview
  `mailmaan-regen-jmiaio8em`): cross-project message read/sync → 404
  (no existence leak); read-key send / send-key events → 401 scope
  errors; send-implies-read → 200; malformed JSON → 400; missing
  idempotency key → 400; bad event name → 422; 70KB event → 413;
  duplicate external id with different body → idempotent replay of the
  original event (designed: events replay, no conflict error).
- **Documented retry rule:** failed sends replay as failures (Stripe/
  Resend behavior) — retries require a fresh idempotency key — with a
  regression test asserting zero additional provider calls.
- **Docs pass:** `docs/checklist.md` Days 4–8 checked with evidence
  pointers; `README.md` rewritten (architecture, env table, setup,
  verification, repo map, conventions); `.env.example` updated to the
  ADR-0002 variables (Resend/Inngest references removed). Blueprint
  items explicitly N/A: invalid/duplicate *webhook* signatures (no
  webhook receiver exists — sync dedupe covered Day 5); Playwright
  (no browser harness in this repo — dashboard verified via builds,
  integration-covered queries, and server-action error paths).

## Commands and tests actually run
- `request-ids.it.test.ts` 1/1, `journey.it.test.ts` 1/1,
  `emails.it.test.ts` 3/3 (incl. new failed-replay case),
  MCP `diagnose.test.ts` 4/4 (incl. request-id correlation).
- `npm run typecheck` — clean. `npm run typecheck:packages` — clean.
  `npx eslint` on touched paths — clean.
- Preview deploy + 10 live adversarial probes above (no emails
  dispatched; probe project deleted, zero orphans).

## Acceptance criteria now satisfied
- Day 8 proof: the full flow works after a fresh setup (automated
  journey), and diagnosis uses stored evidence including request IDs
  (API + dashboard + MCP).
- Core test matrix green; docs match the actual implementation.

## Remaining risks and blockers
- No browser-level (Playwright) coverage of dashboard clicks; mitigated
  by build verification, query integration tests, and shared service
  code with the API paths.
- Suppression list still unenforced (noted Day 6, unchanged).
- Delayed runs still need manual reconciler invocation (no cron).

## Next smallest step
- Owner review → merge `day-08-e2e` to `main` → `vercel --prod`.
  Then Day 9 (hardening, regression sweep) per blueprint.
