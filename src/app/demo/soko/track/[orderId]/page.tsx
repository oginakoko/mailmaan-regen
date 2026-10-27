import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { TemplateService } from "@/lib/templates/service";
import {
  advanceDemoOrder,
  callDemoMailmaan,
  demoTrackingUrl,
  type DemoOrder,
  type DemoStage,
} from "@/lib/demo/soko";
import Tracker from "./tracker";

const AI_VARIABLES = ["firstName", "orderId"] as const;
const DEFAULT_BRIEF =
  "Thank the buyer warmly for their order, ask for a short review, and offer 10% off the next order with code ASANTE10.";

async function generateAiAction(formData: FormData): Promise<void> {
  "use server";
  const orderId = String(formData.get("orderId") ?? "");
  const brief = String(formData.get("brief") ?? "").trim().slice(0, 500) || DEFAULT_BRIEF;
  const result = await callDemoMailmaan("/v1/templates/generate", {
    purpose: "custom",
    brief,
    required_variables: [...AI_VARIABLES],
  });
  if (!result.ok) {
    const message =
      ((result.payload.error as Record<string, unknown> | undefined)?.message as string | undefined) ??
      "AI generation failed.";
    redirect(`/demo/soko/track/${orderId}?aiError=${encodeURIComponent(message)}`);
  }
  const draftId = ((result.payload.template as Record<string, unknown> | undefined)?.id as string | undefined) ?? "";
  redirect(`/demo/soko/track/${orderId}?ai=${encodeURIComponent(draftId)}`);
}

async function sendAiAction(formData: FormData): Promise<void> {
  "use server";
  const orderId = String(formData.get("orderId") ?? "");
  const draftId = String(formData.get("draftId") ?? "");
  const back = (extra: string): never => redirect(`/demo/soko/track/${orderId}${extra}`);
  const db = createSupabaseServiceClient();
  const { data: order } = await db.from("demo_orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) notFound();
  const demo = order as DemoOrder;
  const { data: draft } = await db
    .from("templates")
    .select("id, project_id, slug, status, variables_schema")
    .eq("id", draftId)
    .eq("project_id", demo.project_id)
    .maybeSingle();
  if (!draft) redirect(`/demo/soko/track/${orderId}?aiError=Draft%20not%20found.`);
  const schema = (draft.variables_schema ?? {}) as { variables?: Array<{ name: string; required: boolean }> };
  const known = new Set<string>([...AI_VARIABLES]);
  const unknown = (schema.variables ?? []).filter((v) => v.required && !known.has(v.name)).map((v) => v.name);
  if (unknown.length > 0) {
    back(`?aiError=${encodeURIComponent(`The AI used variables this demo cannot fill: ${unknown.join(", ")}.`)}`);
  }
  await new TemplateService().publishTemplate(demo.project_id, draft.id);
  // Pass only what the draft declares: strict validation rejects extras.
  const declared = new Set((schema.variables ?? []).map((v) => v.name));
  const values: Record<string, string> = {};
  if (declared.has("firstName")) values.firstName = demo.first_name;
  if (declared.has("orderId")) values.orderId = demo.order_number;
  const sent = await callDemoMailmaan("/v1/emails", {
    to: demo.email,
    template: draft.slug,
    variables: values,
    metadata: { source: "soko-demo-ai-thanks" },
    idempotencyKey: `soko-demo/${demo.order_number}/ai-thanks`,
  });
  if (!sent.ok) {
    const message =
      ((sent.payload.error as Record<string, unknown> | undefined)?.message as string | undefined) ??
      "AI email send failed.";
    back(`?aiError=${encodeURIComponent(message)}`);
  }
  back("?aiSent=1");
}

async function TrackOrderContent({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ ai?: string; aiError?: string; aiSent?: string }>;
}) {
  const { orderId } = await params;
  const query = await searchParams;
  let initial: { order: DemoOrder; stages: DemoStage[]; error?: string };
  try {
    initial = await advanceDemoOrder(orderId);
  } catch {
    notFound();
  }
  const { order, stages } = initial;
  const delivered = stages.every((stage) => stage.fired);

  let draft: {
    id: string;
    subject: string;
    text: string;
    generatedBy: string;
    model: string | null;
  } | null = null;
  if (query.ai) {
    const db = createSupabaseServiceClient();
    const { data } = await db
      .from("templates")
      .select("id, subject_template, text_template, generation_metadata")
      .eq("id", query.ai)
      .eq("project_id", order.project_id)
      .maybeSingle();
    if (data) {
      const meta = (data.generation_metadata ?? {}) as Record<string, unknown>;
      draft = {
        id: data.id,
        subject: data.subject_template,
        text: data.text_template ?? "",
        generatedBy: typeof meta.generated_by === "string" ? meta.generated_by : "unknown",
        model: typeof meta.model === "string" ? meta.model : null,
      };
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f4f0] text-stone-900">
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <header className="flex items-baseline justify-between border-b border-stone-300 pb-4">
          <a href="/demo/soko" className="font-serif text-2xl tracking-tight">
            Soko
          </a>
          <p className="text-sm text-stone-500">Order {order.order_number}</p>
        </header>

        <section className="mt-8 rounded-lg border border-stone-300 bg-white p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="font-serif text-2xl">
              {order.first_name}&apos;s order · {order.currency} {Number(order.total).toLocaleString()}
            </h1>
            <p className="text-sm text-stone-500">updates to {order.email}</p>
          </div>
          <div className="mt-6">
            <Tracker
              orderId={order.id}
              initial={{ stages, ...(initial.error ? { error: initial.error } : {}) }}
            />
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-stone-300 bg-white p-6">
          <h2 className="font-serif text-xl">AI thank-you email</h2>
          {!delivered ? (
            <p className="mt-1 text-sm text-stone-500">
              This unlocks when the order is delivered — the finale of the demo.
            </p>
          ) : (
            <p className="mt-1 text-sm text-stone-500">
              Delivered! Now brief the AI for a one-off thank-you email. You
              review the draft before anything sends.
            </p>
          )}
          {query.aiError ? (
            <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{query.aiError}</p>
          ) : null}
          {query.aiSent ? (
            <p className="mt-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
              AI thank-you sent — check the inbox, then find it in the Mailmaan dashboard timeline.
            </p>
          ) : null}
          {delivered && !query.aiSent ? (
            <div className="mt-4 space-y-4">
              <form action={generateAiAction} className="space-y-3">
                <input type="hidden" name="orderId" value={order.id} />
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">Brief for the AI</span>
                  <textarea
                    name="brief"
                    rows={3}
                    maxLength={500}
                    defaultValue={DEFAULT_BRIEF}
                    className="w-full rounded-md border border-stone-300 px-3 py-2"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-md bg-[#1a7f37] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#156b2f]"
                >
                  Generate thank-you email
                </button>
              </form>
              {draft ? (
                <div className="rounded-lg bg-stone-100 p-4 text-sm">
                  <p className="text-xs uppercase tracking-wide text-stone-500">
                    Draft preview · by {draft.generatedBy}
                    {draft.model ? ` · ${draft.model}` : " (fallback — no AI key configured)"}
                  </p>
                  <p className="mt-2 font-medium text-stone-900">Subject: {draft.subject}</p>
                  <pre className="mt-2 whitespace-pre-wrap font-sans leading-6 text-stone-700">{draft.text}</pre>
                  <form action={sendAiAction} className="mt-3">
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="draftId" value={draft.id} />
                    <button
                      type="submit"
                      className="rounded-md bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-700"
                    >
                      Publish &amp; send this email
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          ) : null}
          <p className="mt-4 text-xs text-stone-400">
            Tracking link for the emails: {demoTrackingUrl(order.id)}
          </p>
        </section>
      </div>
    </main>
  );
}

export default function TrackOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ ai?: string; aiError?: string; aiSent?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f4f4f0] text-stone-900">
          <div className="mx-auto w-full max-w-3xl px-6 py-10">
            <p className="text-sm text-stone-500">Loading your order…</p>
          </div>
        </main>
      }
    >
      <TrackOrderContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
