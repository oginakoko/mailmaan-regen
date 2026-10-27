# Soko Store — Mailmaan SDK example

Minimal store integration using `mailmaan-sdk` from server-side code.
Signup and checkout emit app events; Mailmaan workflows send the
welcome/receipt emails.

## Setup

```bash
# 1. Build the SDK once
cd ../../packages/sdk && npx tsup src/index.ts --format esm --dts --clean && cd -

# 2. Install the example (links the local SDK)
cd examples/soko-store && npm install

# 3. Configure (server-side only — never commit the key)
cp .env.example .env
# MAILMAAN_API_URL=https://mailmaan-regen.vercel.app
# MAILMAAN_API_KEY=mk_live_...   # needs events (+send for direct sends) scope
```

The target project needs `welcome` and `receipt` published templates plus
`user.signed_up` → welcome and `order.paid` → receipt workflows (Day 6
demo wiring), an SMTP mailbox, and the recipient on the test allowlist.

## Run

```bash
npm run demo -- philipstar98@gmail.com   # sends 2 real emails via workflows
```

`src/store.ts` is the integration: `signup`, `checkout`, and
`sendWelcomeDirect`. Unit tests (`src/store.test.ts`) run offline with a
stubbed client: `npx vitest run examples/soko-store/src/store.test.ts`
from the repo root.
