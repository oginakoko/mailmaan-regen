# Day 7 report — TypeScript SDK, soko-store example, MCP server (2026-10-27)

## Implemented
- Branch `day-07-sdk` from `main`; `main` untouched.
- **TypeScript SDK** (`packages/sdk`): `MailmaanClient` over the public
  API (health, listTemplates, sendEmail with auto-generated idempotency
  keys, get/sync message, track/reconcile events), typed
  `MailmaanApiError` (code/status/requestId/retryable). tsup ESM+dts
  build; 6/6 stub-fetch unit tests.
- **soko-store example** (`examples/soko-store`): server-side store flows
  (`signup` → `user.signed_up`, `checkout` → `order.paid`,
  `sendWelcomeDirect`) with offline unit tests, README setup/run docs,
  and an esbuild-bundled demo runner (`npm run demo`, typecheck-clean).
- **MCP server** (`packages/mcp-server`, stdio): six tools for coding
  agents — `connection_check`, `list_templates`, `send_test_email`,
  `track_event`, `get_message`, `diagnose_message` (pure
  evidence-based diagnosis: timeline walk, error, likely cause, next
  checks; unknown codes admitted, never invented). API failures surface
  with code + request id. `.mcp.json` agent config at the repo root.
- **Agent-driven integration:** using MCP tools only (no direct API or
  DB access), an agent session confirmed the `welcome` slug + required
  variables and the accepted-state shape, then added `inviteFriend`
  (referral invite, stable `soko-invite/<token>` idempotency) to
  soko-store with a unit test; verified live (`accepted`).
- **Homepage:** replaced the stale Day-1 placeholder copy with accurate
  text plus dashboard/health links (still a placeholder page, not a
  marketing site — no polished public frontend exists by design).

## Live verification (production API, designated test inbox)
- `npm run demo` (SDK path): signup + checkout both `dispatched` with
  `completed` runs; messages `accepted` (“Welcome to Soko, Demo!”,
  “Receipt for order DEMO-…”).
- MCP machine proof (`scripts/proof.mjs`, real MCP client over stdio,
  all six tools): connection ok, templates listed, `send_test_email`
  → `accepted`, `track_event` → `dispatched` + completed run, `get_message`
  → accepted + timeline, `diagnose_message` on a failed message →
  correct likely cause. Both proof emails `accepted` in Supabase.
- `inviteFriend` live: `accepted`, first send (`replayed: false`).

## Commands and tests actually run
- `packages/sdk` 6/6, `examples/soko-store` 4/4 (incl. invite),
  MCP diagnose 3/3 + handlers 5/5 — all stub/offline unit tests.
- `npm run typecheck` — clean (fixed a `.ts`-import demo error by
  switching the runner to an esbuild bundle; fixed forward in a
  follow-up commit after an accidental commit of the error).
- `npx eslint` on touched paths — clean. tsup builds for SDK (ESM+dts)
  and MCP server (node20 ESM + shebang) succeed. Fixed along the way:
  tsup banner-flag syntax (moved to `tsup.config.ts`), es2017
  top-level-await target, `%20` stdio path bug, double shebang.
- Live: SDK demo (2 emails), MCP proof (2 emails), invite (1 email) —
  5 real test emails, all `accepted`, all to the designated inbox.

## Acceptance criteria now satisfied
- Day 7 proof: a real MCP client invoked all Mailmaan tools successfully
  against production, and the example app was updated through the
  MCP-discovered, SDK-documented integration path — verified live.
- SDK + example + MCP server + agent config shipped with docs.

## Remaining risks and blockers
- MCP distribution is local-build only (no registry publish); agents
  need the repo + `npm install` + `npm run build` in `packages/mcp-server`.
- No polished public/marketing frontend (out of scope for the ten days).
- Proof/demo scripts are manual by design (they send real emails) and
  excluded from automated suites.

## Next smallest step
- Owner review → merge `day-07-sdk` to `main` → `vercel --prod`
  (note: prod deploy only affects the Next app; packages/examples are
  not part of the Vercel build). Then Day 8 (end-to-end demo +
  diagnostics depth).
