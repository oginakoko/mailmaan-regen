# Soko Store — Mailmaan SDK example

Reference integration: a minimal store using `mailmaan-sdk` from
server-side code. Signup and checkout emit app events; Mailmaan
workflows turn them into welcome/receipt emails.

## The contract (both sides must match)

Variable validation is **strict**: every required template variable
must be present in the send, and unknown variables fail it. Event
`data` must therefore carry everything the template needs:

| App event | Event `data` | Workflow → template (vars) |
|---|---|---|
| `user.signed_up` | `{email, firstName}` | welcome `{firstName*}` to `data.email` |
| `order.paid` | `{customerEmail, firstName, orderId, total, currency}` | receipt `{firstName*, orderId*, total*, currency*}` to `data.customerEmail` |

External ids (`soko-signup/<userId>`, `soko-order/<orderId>`) replay
idempotently: retrying a checkout never double-sends.

## Setup

```bash
# 1. Build the SDK once
cd ../../packages/sdk && npx tsup src/index.ts --format esm --dts --clean && cd -

# 2. Install the example (links the local SDK)
cd examples/soko-store && npm install

# 3. Configure (server-side only — never commit the key)
cp .env.example .env
# MAILMAAN_API_URL=https://mailmaan-regen.vercel.app
# MAILMAAN_API_KEY=mk_live_...   # needs events scope (send for direct sends)
```

The target project needs published `welcome` + `receipt` templates,
`user.signed_up` → welcome and `order.paid` → receipt workflows, and an
SMTP mailbox. The seeded `[Demo] Soko Store` project ships exactly this
wiring.

## Run

```bash
npm run demo -- philipstar98@gmail.com   # sends 2 real emails via workflows
```

`src/store.ts` is the integration: `signup`, `checkout`,
`sendWelcomeDirect` (direct template send, no workflow), and
`inviteFriend`. Unit tests (`src/store.test.ts`) run offline with a
stubbed client: `npx vitest run examples/soko-store/src/store.test.ts`
from the repo root.
