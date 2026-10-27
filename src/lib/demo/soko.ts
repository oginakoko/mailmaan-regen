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
}

export const DEMO_STAGES: Array<{ key: string; label: string; event: string; dueSeconds: number }> = [
  { key: "confirmed", label: "Order confirmed", event: "order.paid", dueSeconds: 0 },
  { key: "packed", label: "Packed", event: "order.packed", dueSeconds: 60 },
  { key: "shipped", label: "Shipped", event: "order.shipped", dueSeconds: 120 },
  { key: "out_for_delivery", label: "Out for delivery", event: "order.out_for_delivery", dueSeconds: 180 },
  { key: "delivered", label: "Delivered", event: "order.delivered", dueSeconds: 240 },
];

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
  const response = await fetch(`${demoBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${demoApiKey()}`,
      "content-type": "application/json",
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
  const response = await fetch(`${demoBaseUrl()}/v1/events`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${demoApiKey()}`,
      "content-type": "application/json",
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
      stages.push({ ...stage, fired: true });
      continue;
    }
    if (elapsed < stage.dueSeconds) {
      stages.push({ ...stage, fired: false });
      continue;
    }
    const result = await fireDemoStageEvent(order, stage.event, stage.key);
    if (!result.ok) {
      error = result.message ?? result.code ?? "Event fire failed.";
      stages.push({ ...stage, fired: false });
      break;
    }
    stages.push({ ...stage, fired: true });
  }
  return { order, stages, ...(error ? { error } : {}) };
}
