# Day 3 report — Template engine and AI generation (2026-10-26)

## Implemented
- Branch `day-03-templates` from Day 2; `main` untouched.
- **Template draft/publish/version model** (`src/lib/templates/service.ts`):
  `TemplateService` over the existing `templates` table. Drafts are never
  resolvable for sending; publishing is explicit and immutable — editing a
  published/archived template forks the next draft `version`, so the current
  published version (highest `version` with `status='published'` per
  `(project_id, slug)`) never changes under a reader. `listPublished` returns
  the latest published version per slug; `getPublishedBySlug` is the
  deterministic resolution the Day 4 send path will use. Archive supported.
- **Safe server-side rendering** (`src/lib/email/render.ts`): variable values
  are HTML-escaped before insertion (cannot inject markup or break out of an
  attribute), authored HTML is sanitized with `sanitize-html` (pure JS,
  serverless-safe; scripts, event handlers, forms and unsafe URLs stripped),
  rendered HTML is sanitized again at render time, subjects reject CR/LF
  injection, and a plain-text body is derived. `variables_schema` is a Zod
  schema (`variablesSchemaSchema`): each variable has `name`, `type`,
  `required`, `example`; `validateVariableValues` reports missing required
  variables, type mismatches and undeclared variables.
- **Muse provider + deterministic fallback** (`src/lib/templates/generation.ts`):
  Meta Muse via the Meta Model API (`https://api.meta.ai/v1`, OpenAI-compatible
  Chat Completions, Bearer `AI_API_KEY`, model from `AI_TEMPLATE_MODEL`, one
  repair retry on invalid output). When key or model is missing,
  `generateTemplate` returns deterministic templates labelled
  `generated_by: "fallback"` — demo content, never presented as AI output.
  Soko `welcome` (`fallbackWelcome`) and `receipt` (`fallbackReceipt`)
  fallbacks are brand-matched and deterministic.
- **Templates dashboard** (`src/app/dashboard/projects/[projectId]/templates/page.tsx`,
  linked from `src/app/dashboard/page.tsx`): list with status/version,
  server-side preview (same `renderTemplate` as the send path, sandboxed
  iframe + text body + variable issues), edit/publish/archive actions,
  generation form, "add the labelled Soko demo pair" action. Fallback rows
  carry a `[Demo] fallback content` badge; Muse rows show `AI (<model>)`.
  Generation never sends email.
- **Public API** `GET /v1/templates` (`src/app/api/v1/templates/route.ts`):
  Bearer API-key auth with `read` scope (via the new `assertScope` helper in
  `src/lib/api-keys/service.ts`, `requireScope` kept as wrapper), returns
  published templates only with `required_variables` and full `variables`.
  Both catch branches log `[templates] GET failed { code, request_id, message }`
  (no secrets) and return the Blueprint error envelope.
- **Env** (`src/lib/env.ts`, `.env.example`): optional server-only
  `AI_API_KEY`, `AI_BASE_URL`, `AI_TEMPLATE_MODEL`, `AI_MODELS_PATH`.
  `package.json`/`package-lock.json`: `sanitize-html` + `@types/sanitize-html`.

## Commands and tests actually run
- `npm run test` → **PASS**: `Test Files 7 passed (7)`, `Tests 21 passed (21)`.
  Includes `render.test.ts` (escaping, CR/LF rejection, sanitization),
  `generation.test.ts` (fallback labelling, receipt variable completeness,
  determinism), `route.test.ts` (fail-closed auth gate), and the live
  integration suite `tests/integration/templates.it.test.ts` (ran, not
  skipped, ~15–23s): creates a Soko welcome draft from the real
  `fallbackWelcome`, asserts it is absent from `listPublished` /
  `getPublishedBySlug`, publishes, resolves it, renders asserting `#0F172A`
  and `Asha` plus a hostile-name render asserting `&lt;b&gt;Asha&lt;/b&gt;`
  with no raw `<b>Asha</b>`, edits the published template and asserts a new
  v2 draft fork while published v1 is unchanged, then archives both.
  Post-run read-only SQL: probe rows archived at v1 and v2.
- `npm run lint` → PASS (exit 0). `npm run typecheck` → PASS (exit 0).
- `npm run build` → PASS outside the sandbox (`✓ Compiled successfully`,
  static pages 11/11, route table includes `ƒ /api/v1/templates` and the
  templates dashboard). Sandboxed build fails with Turbopack
  `binding to a port / Operation not permitted (os error 1)` — a sandbox
  restriction on the PostCSS worker, not a code failure.
- **Public proof (deployed, prior step, quoted verbatim):**
  - `vercel deploy --prod --yes` → exit 0; `Production: https://mailmaan-regen-jd7xsvtec-philip-oginas-projects.vercel.app`, remote build `✓ Compiled successfully in 3.2s`, `Aliased: https://mailmaan-regen.vercel.app`.
  - `curl https://mailmaan-regen.vercel.app/v1/health` → HTTP 200:
    `{"status":"ok","version":"0.1.0","timestamp":"2026-10-26T19:23:34.069Z"}`
  - `curl https://mailmaan-regen.vercel.app/v1/templates` (no key) → HTTP 401 (not 500):
    `{"error":{"code":"invalid_api_key","message":"API key is missing, invalid, revoked, or expired.","request_id":"c842853f-e33b-416e-bb35-f01e8ad62bcb"}}`
  - Happy path on deployed: published probe template inserted (HTTP 201, slug
    `probe-1793042677112`), read-scope key stored as SHA-256 hash only
    (HTTP 201, key [REDACTED]), then `GET /v1/templates` with that key →
    HTTP 200: `{"templates":[{"id":"25236d9b-d379-4bff-afed-610087e36ef5","slug":"probe-1793042677112","name":"Probe Welcome","purpose":"welcome","version":1,"required_variables":["firstName"],"variables":[{"name":"firstName","type":"string","example":"Asha","required":true}]}]}`.
    Cleanup: template archived (HTTP 200), key revoked (HTTP 200); read-only
    SQL confirms both. No email was sent anywhere.

## Day 3 acceptance criteria (Blueprint §14)
- [x] Template draft/publish/version + safe server-side rendering — live
  integration proof: draft invisible, publish resolves, edit forks v2,
  published v1 immutable, hostile input escaped.
- [x] Brand form + AI template-generation endpoint (clearly labelled
  fallbacks) — dashboard generation uses the project brand profile; without
  AI config it returns deterministic templates labelled fallback/demo.
- [x] Soko `welcome` and `receipt` templates with previews — deterministic
  fallbacks, dashboard preview via the real renderer.
- [x] Preview / edit / publish and deterministic resolution
  (`getPublishedBySlug` = latest published version) verified end to end.
- [ ] **Honest gap:** real Muse generation is unverifiable until
  `AI_API_KEY` + `AI_TEMPLATE_MODEL` are provided. Until then every generated
  template is the deterministic fallback and is labelled demo exactly that
  way (`generated_by: "fallback"`, `[Demo]` badge) — never claimed as AI.

## Remaining risks and blockers
- **Deployed root cause found this round:** `GET /v1/templates` previously
  surfaced failures as an opaque HTTP 500 on Vercel instead of the Blueprint
  JSON envelope. Fixed by returning the error envelope with `request_id` in
  both catch branches, adding structured `[templates] GET failed` server
  logging (code + request_id, no secrets), and rendering/sanitizing with
  pure-JS `sanitize-html` instead of a DOM-dependent sanitizer that is unsafe
  in the serverless runtime. Public recheck now proves 401 with the envelope.
- Real Muse generation blocked on `AI_API_KEY` + `AI_TEMPLATE_MODEL` (see gap
  above). No key was invented or hardcoded; model id stays env-configured.
- `SUPABASE_SERVICE_ROLE_KEY` remains local-only (`.env.local`, never
  committed) plus the deployed project's server env; it is never exposed to
  the browser and no value is printed in this report.
- Integration suite depends on the real test Supabase project
  ("Isolation A"); it skips (does not fake green) when the service key is
  absent. Probe rows/keys from verification are archived/revoked.
- No email sent anywhere on Day 3; templates only render previews.

## Next smallest step
Day 4: real email send path — `EmailProvider` interface + Resend adapter,
`POST /v1/emails` with idempotency and durable queued state resolving the
published template via `getPublishedBySlug`, Inngest send function, and a
real test-email proof.
