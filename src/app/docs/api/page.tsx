import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API reference — Mailmaan docs",
  description: "Endpoints, scopes, idempotency, rate limits and errors.",
};

interface Endpoint {
  method: "GET" | "POST";
  path: string;
  scope: string;
  summary: string;
  request?: string;
  statuses: string;
}

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/v1/health",
    scope: "none",
    summary: "Service liveness. No authentication.",
    statuses: "200",
  },
  {
    method: "GET",
    path: "/v1/project",
    scope: "read",
    summary: "The project this key belongs to.",
    statuses: "200 · 401",
  },
  {
    method: "GET",
    path: "/v1/templates",
    scope: "read",
    summary: "Published templates with their required variables.",
    statuses: "200 · 401 · 429",
  },
  {
    method: "POST",
    path: "/v1/templates/generate",
    scope: "templates",
    summary: "Generate one template draft from the project brand. Draft only — publishing is human, in the dashboard.",
    request: `{ "purpose": "welcome", "brief": "…", "required_variables": ["firstName"] }`,
    statuses: "201 · 400 · 401 · 422 · 429 · 502",
  },
  {
    method: "POST",
    path: "/v1/emails",
    scope: "send",
    summary: "Render a published template and queue one email.",
    request: `{ "to": "ada@example.com", "template": "welcome", "variables": { "firstName": "Ada" } }\nIdempotency-Key: welcome/ada-1`,
    statuses: "202 · 400 · 401 · 404 · 422 · 429",
  },
  {
    method: "GET",
    path: "/v1/messages/:id",
    scope: "read",
    summary: "One message with its full evidence timeline.",
    statuses: "200 · 401 · 404 · 429",
  },
  {
    method: "POST",
    path: "/v1/messages/:id/sync",
    scope: "read",
    summary: "Read the message state back from the provider and journal it. Never invents delivery.",
    statuses: "200 · 401 · 404 · 429",
  },
  {
    method: "POST",
    path: "/v1/events",
    scope: "events",
    summary: "Fire an app event; matching workflows run inline and return their runs.",
    request: `{ "id": "order/123", "name": "order.paid", "data": { "customerEmail": "…", "orderId": "123" } }`,
    statuses: "202 · 400 · 401 · 413 · 422 · 429",
  },
  {
    method: "POST",
    path: "/v1/events/reconcile",
    scope: "events",
    summary: "Dispatch pending events, execute due runs, recover stuck runs. Returns counts including runs_reset.",
    statuses: "200 · 401 · 429",
  },
];

export default function ApiReferencePage() {
  return (
    <div>
      <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">API reference</h1>
      <p className="mt-3 max-w-2xl leading-8 text-[#1c1917]/70">
        Base URL <code className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">https://mailmaan-regen.vercel.app</code>.
        Authenticate with <code className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">Authorization: Bearer mk_live_…</code> —
        keys are project-scoped and server-side only. Reads allow 600/min, writes 120/min per key;
        429 carries <code className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">Retry-After</code>.
        Every error carries a <code className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">request_id</code>.
      </p>

      <h2 className="mt-12 font-display text-2xl font-medium sm:text-3xl">Scopes</h2>
      <p className="my-4 leading-8 text-[#1c1917]/85">
        <code className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">read</code> (implied by{" "}
        <code className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">send</code> and{" "}
        <code className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">events</code> only —{" "}
        <code className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">templates</code> does not imply it),{" "}
        <code className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">send</code>,{" "}
        <code className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">events</code>,{" "}
        <code className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">templates</code>.
        Missing scope → 401 naming it.
      </p>

      <h2 className="mt-12 font-display text-2xl font-medium sm:text-3xl">Idempotency</h2>
      <p className="my-4 leading-8 text-[#1c1917]/85">
        Sends take <code className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">Idempotency-Key</code> (required);
        events take a stable <code className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">id</code>.
        Same key + same body replays the same record; same key + different body is rejected
        (422 <code className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">idempotency_key_reused</code>).
        Failed sends replay as failures — retries need a fresh key. Events differ: replaying an{" "}
        <code className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">id</code> returns the first record
        (<code className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">replayed: true</code>) and ignores
        the new body — never a rejection. Malformed JSON is 400 on every POST.
      </p>

      <h2 className="mt-12 font-display text-2xl font-medium sm:text-3xl">Endpoints</h2>
      <div className="mt-6 space-y-4">
        {ENDPOINTS.map((endpoint) => (
          <section key={`${endpoint.method} ${endpoint.path}`} className="rounded-lg border border-[#1c1917]/15 bg-white p-6">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`rounded px-2.5 py-1 font-mono text-xs font-bold ${
                  endpoint.method === "GET" ? "bg-[#1a7f37]/10 text-[#1a7f37]" : "bg-[#b3402a]/10 text-[#b3402a]"
                }`}
              >
                {endpoint.method}
              </span>
              <code className="font-mono text-[15px] font-semibold">{endpoint.path}</code>
              <span className="rounded-full border border-[#1c1917]/20 px-2.5 py-0.5 font-mono text-xs text-[#1c1917]/70">
                {endpoint.scope}
              </span>
            </div>
            <p className="mt-3 leading-7 text-[#1c1917]/75">{endpoint.summary}</p>
            {endpoint.request ? (
              <pre className="mt-3 overflow-x-auto rounded-md bg-[#1c1917] p-4 font-mono text-[13px] leading-6 text-[#f7f2e7]">
                {endpoint.request}
              </pre>
            ) : null}
            <p className="mt-3 font-mono text-xs text-[#1c1917]/60">{endpoint.statuses}</p>
          </section>
        ))}
      </div>

      <h2 className="mt-12 font-display text-2xl font-medium sm:text-3xl">Truthful statuses</h2>
      <p className="my-4 leading-8 text-[#1c1917]/85">
        Messages move <code className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">queued → accepted / failed</code>.
        Upstream <code className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">sent</code> confirms{" "}
        <code className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">accepted</code>;{" "}
        <code className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">delivered</code> appears only with
        provider evidence. Bounces and complaints auto-suppress the recipient; plain failures never do.
      </p>
    </div>
  );
}
