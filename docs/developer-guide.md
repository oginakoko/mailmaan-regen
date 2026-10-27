# Developer guide — connect your app to Mailmaan

Base URL: `https://mailmaan-regen.vercel.app`. Dashboard: same host,
`/dashboard`. Keys are project-scoped and server-side only.

## The mental model (read this first)

1. **AI generates each template ONCE** — a brand-matched draft per email
   type (welcome, receipt, …), saved for human review. A human publishes
   it in the dashboard. AI never generates per send.
2. **Your app fires events per user action** — `user.signed_up`,
   `order.paid` — with the user data in `data`.
3. **Workflows map events to templates** — recipient path + variable
   mappings fill the published template. Same template, every user.
4. **Every send keeps a truthful timeline** — `queued → accepted /
   failed`, synced back from the provider. Read it, diagnose from it.

## 5-minute integration

**Dashboard (once per project):**

1. Create a project → you land on its setup checklist.
2. SMTP → connect the mailbox the project sends from (its own —
   never shared). Sends are blocked until this is set.
3. Templates → Generate draft (AI when configured, labelled fallback
   otherwise) or write one → review → **Publish**. Note the slug and
   its required variables.
4. Workflows → new workflow: trigger event name, recipient path
   (e.g. `data.email`), variable mappings (e.g.
   `{"firstName": {"path": "data.firstName"}}` or
   `{"product": {"const": "Soko"}}`), enable it.
5. API keys → create a key with `events` scope (`send` for direct
   sends, `templates` for agent generation, `read` is implied).

**Code (per user action):**

```ts
import { MailmaanClient } from "mailmaan-sdk";

const mailmaan = new MailmaanClient({ apiKey: process.env.MAILMAAN_API_KEY });

// On signup — stable external id makes retries safe (replays, never dupes).
await mailmaan.trackEvent({
  id: `myapp-signup/${user.id}`,
  name: "user.signed_up",
  data: { email: user.email, firstName: user.firstName },
});

// On purchase.
await mailmaan.trackEvent({
  id: `myapp-order/${order.id}`,
  name: "order.paid",
  data: {
    customerEmail: order.email,
    firstName: order.firstName,
    orderId: order.id,
    total: order.total,
    currency: order.currency,
  },
});
```

Direct send without a workflow (needs `send` scope):

```ts
await mailmaan.sendEmail({
  to: user.email,
  template: "welcome",
  variables: { firstName: user.firstName },
  idempotencyKey: `welcome/${user.id}`,
});
```

See `examples/soko-store` — the runnable reference. Its README states
the exact event/template contract, and `npm run demo` fires both
emails for real.

## Event design rules

- `data` must carry **every** required template variable. Validation
  is strict both ways: missing variables fail, unknown variables fail.
- Put the recipient address in `data` and point the workflow's
  `recipient_path` at it.
- Always pass a stable `id` (your user/order id). Same id + same body
  replays the same event; same id + different body is rejected.
- Keep event names dotted and past-tense: `user.signed_up`,
  `order.paid`, `password.reset_requested`.

## Agent path (MCP)

Seven tools: `connection_check`, `list_templates`,
`generate_template` (draft only — publishing stays human),
`send_test_email`, `track_event`, `get_message`,
`diagnose_message`. Point `.mcp.json` at the server with the project
key; the agent flow is: check → generate → (human publishes) → track
test event → read timeline → diagnose from evidence.

## Limits and errors

- Rate limits: 120 writes/min, 600 reads/min per key; 429 carries
  `Retry-After`.
- Test allowlist: while `MAILMAAN_TEST_RECIPIENTS` is set, `to` must
  be allowlisted (422 `recipient_not_allowed` otherwise).
- Common codes: `smtp_not_configured` (connect a mailbox),
  `missing required variable` / `unknown variable supplied` (fix event
  data or mappings), `recipient_suppressed` (bounce/complaint history),
  `idempotency_key_reused` (same key, different body — use a fresh key).
- Statuses are truthful: `accepted` means the provider took it;
  `delivered` appears only with provider evidence. Sync any message
  with `POST /v1/messages/:id/sync`.
