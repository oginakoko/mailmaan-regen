import "server-only";
import { createSupabaseServiceClient } from "../supabase/service";

/**
 * Soko demo store backend (Day 10 demo). A public one-product storefront
 * that exercises the real Mailmaan API as a customer would: checkout
 * fires `order.paid`, and the tracker fires one lifecycle event per
 * minute (packed → shipped → out for delivery → delivered). No cron:
 * tracker page visits drive stage advancement, and stable external ids
 * make every fire idempotent.
 */

export interface DemoOrder {
  id: string;
  project_id: string;
  order_number: string;
  email: string;
  first_name: string;
  total: string;
  currency: string;
  placed_at: string;
}

export interface DemoStage {
  key: string;
  label: string;
  event: string;
  dueSeconds: number;
  fired: boolean;
  /** Workflow run outcome once fired; surfaced so failed emails never look sent. */
  runStatus: string | null;
  runError: string | null;
}

export const DEMO_STAGES: Array<{ key: string; label: string; event: string; dueSeconds: number }> = [
  { key: "confirmed", label: "Order confirmed", event: "order.paid", dueSeconds: 0 },
  { key: "packed", label: "Packed", event: "order.packed", dueSeconds: 60 },
  { key: "shipped", label: "Shipped", event: "order.shipped", dueSeconds: 120 },
  { key: "out_for_delivery", label: "Out for delivery", event: "order.out_for_delivery", dueSeconds: 180 },
  { key: "delivered", label: "Delivered", event: "order.delivered", dueSeconds: 240 },
  { key: "thank_you", label: "Thank-you note", event: "order.thank_you", dueSeconds: 300 },
];

/** One quote per order, stable per order number — every thank-you is unique. */
const THANK_YOU_QUOTES = [
  "Great coffee, like a good day, starts with intention.",
  "Life begins after coffee.",
  "May your coffee be strong and your Monday short.",
  "Adventure in every cup.",
  "Brewed for slow mornings and big plans.",
  "First sip focus, second sip courage.",
];

export function quoteForOrder(orderNumber: string): string {
  let hash = 0;
  for (let i = 0; i < orderNumber.length; i += 1) hash = (hash * 31 + orderNumber.charCodeAt(i)) >>> 0;
  return THANK_YOU_QUOTES[hash % THANK_YOU_QUOTES.length];
}

function demoApiKey(): string {
  // Server-only: never import this module from client components.
  const key = process.env.MAILMAAN_DEMO_API_KEY;
  if (!key) throw new Error("Demo store is not configured (missing MAILMAAN_DEMO_API_KEY).");
  return key;
}

function demoBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://mailmaan-regen.vercel.app";
}

export function demoTrackingUrl(orderId: string): string {
  return `${demoBaseUrl()}/demo/soko/track/${orderId}`;
}

/** Authenticated POST to the Mailmaan API as the demo customer would. */
export async function callDemoMailmaan(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; payload: Record<string, unknown> }> {
  // Preview deployments sit behind Vercel SSO; the automation bypass lets
  // this deployment call its own API. Unset (production) — header omitted.
  const bypass = process.env.MAILMAAN_DEMO_BYPASS;
  const response = await fetch(`${demoBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${demoApiKey()}`,
      "content-type": "application/json",
      ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, payload };
}

export async function getDemoOrder(orderId: string): Promise<DemoOrder | null> {
  const db = createSupabaseServiceClient();
  const { data } = await db.from("demo_orders").select("*").eq("id", orderId).maybeSingle();
  return (data as DemoOrder | null) ?? null;
}

/** Fire one lifecycle event through the public API (idempotent). */
export async function fireDemoStageEvent(
  order: DemoOrder,
  event: string,
  stageKey: string,
): Promise<{ ok: boolean; code?: string; message?: string }> {
  const bypass = process.env.MAILMAAN_DEMO_BYPASS;
  const qty = Math.max(1, Math.round(Number(order.total) / 1850) || 1);
  const response = await fetch(`${demoBaseUrl()}/v1/events`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${demoApiKey()}`,
      "content-type": "application/json",
      ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}),
    },
    body: JSON.stringify({
      id: `soko-demo/${order.order_number}/${stageKey}`,
      name: event,
      data: {
        customerEmail: order.email,
        firstName: order.first_name,
        orderId: order.order_number,
        total: order.total,
        currency: order.currency,
        trackingUrl: demoTrackingUrl(order.id),
        quote: quoteForOrder(order.order_number),
        productLine: `Soko Coffee AA × ${qty}`,
      },
    }),
  });
  if (response.ok) return { ok: true };
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
  };
  return { ok: false, code: payload.error?.code, message: payload.error?.message };
}

/**
 * Advance an order: fire every due, unfired stage. Fired-ness is read
 * from Mailmaan's own event journal (external ids), so restarts and
 * double-visits never double-send.
 */
export async function advanceDemoOrder(orderId: string): Promise<{
  order: DemoOrder;
  stages: DemoStage[];
  error?: string;
}> {
  const order = await getDemoOrder(orderId);
  if (!order) throw new Error("Order not found.");
  const db = createSupabaseServiceClient();
  const elapsed = (Date.now() - new Date(order.placed_at).getTime()) / 1000;

  const stages: DemoStage[] = [];
  let error: string | undefined;
  for (const stage of DEMO_STAGES) {
    const externalId = `soko-demo/${order.order_number}/${stage.key}`;
    const { data: existing } = await db
      .from("app_events")
      .select("id")
      .eq("project_id", order.project_id)
      .eq("external_event_id", externalId)
      .maybeSingle();
    if (existing) {
      stages.push({ ...stage, fired: true, runStatus: null, runError: null });
      continue;
    }
    if (elapsed < stage.dueSeconds) {
      stages.push({ ...stage, fired: false, runStatus: null, runError: null });
      continue;
    }
    const result = await fireDemoStageEvent(order, stage.event, stage.key);
    if (!result.ok) {
      error = result.message ?? result.code ?? "Event fire failed.";
      stages.push({ ...stage, fired: false, runStatus: null, runError: null });
      break;
    }
    stages.push({ ...stage, fired: true, runStatus: null, runError: null });
  }

  // Attach workflow run outcomes so failed emails never render as sent.
  const firedStages = stages.filter((stage) => stage.fired);
  if (firedStages.length > 0) {
    const externalIds = firedStages.map((stage) => `soko-demo/${order.order_number}/${stage.key}`);
    const { data: events } = await db
      .from("app_events")
      .select("id, external_event_id")
      .eq("project_id", order.project_id)
      .in("external_event_id", externalIds);
    const eventByExternal = new Map((events ?? []).map((e) => [e.external_event_id as string, e.id as string]));
    const eventIds = [...eventByExternal.values()];
    if (eventIds.length > 0) {
      const { data: runs } = await db
        .from("workflow_runs")
        .select("app_event_id, status, error_code, error_message")
        .in("app_event_id", eventIds);
      const runByEvent = new Map((runs ?? []).map((r) => [r.app_event_id as string, r]));
      for (const stage of firedStages) {
        const eventId = eventByExternal.get(`soko-demo/${order.order_number}/${stage.key}`);
        const run = eventId ? runByEvent.get(eventId) : undefined;
        stage.runStatus = (run?.status as string | undefined) ?? "pending";
        stage.runError =
          run?.status === "failed"
            ? ((run.error_message as string | undefined) ?? (run.error_code as string | undefined) ?? "Send failed.")
            : null;
      }
    }
  }
  return { order, stages, ...(error ? { error } : {}) };
}
