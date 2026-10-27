# mailmaan-sdk

Typed server-side client for the Mailmaan email API. Keys are
project-scoped and server-side only — never ship one to a browser.

```ts
import { MailmaanClient } from "mailmaan-sdk";

const mailmaan = new MailmaanClient({ apiKey: process.env.MAILMAAN_API_KEY! });

// Fire-and-forget event: matching workflows send.
await mailmaan.trackEvent({
  id: `order/${order.id}`,
  name: "order.paid",
  data: { customerEmail, firstName, orderId, total, currency },
});
```

## Methods

| Method | Does |
| ------ | ---- |
| `health()` | Liveness probe (no auth) |
| `listTemplates()` | Published templates + required variables |
| `generateTemplate(purpose, { brief?, requiredVariables? })` | AI-draft a template (saved as draft; needs `templates` scope) |
| `sendEmail({ to, template, variables, idempotencyKey? })` | Render + send (auto-generates an idempotency key when omitted) |
| `getMessage(id)` | Message detail + timeline |
| `syncMessage(id)` | Re-read upstream provider state onto the timeline |
| `trackEvent({ id, name, data })` | Ingest an app event (stable `id` dedupes) |
| `reconcileEvents()` | Advance delayed runs, reset stuck ones |

Errors throw `MailmaanApiError` with `code`, `status`, `requestId` and a
`retryable` flag (429s and 5xx are retryable) for support and diagnosis.

## Develop

```bash
npm run build   # tsup -> dist/ (esm + .d.ts)
npm test        # vitest (mocked fetch, no network)
```
