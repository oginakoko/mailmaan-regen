import { NextResponse } from "next/server";
import { advanceDemoOrder } from "@/lib/demo/soko";

/**
 * GET /api/demo/soko/status?order=<uuid> — public demo endpoint.
 * Advances the order (firing due lifecycle events, idempotent) and
 * returns the stage list. Orders are unguessable UUIDs; the demo key
 * stays server-side in the advance path.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("order") ?? "";
  if (!orderId) {
    return NextResponse.json({ error: { code: "missing_order", message: "order is required." } }, { status: 400 });
  }
  try {
    const result = await advanceDemoOrder(orderId);
    return NextResponse.json({
      order: {
        order_number: result.order.order_number,
        email: result.order.email,
        first_name: result.order.first_name,
        total: result.order.total,
        currency: result.order.currency,
        placed_at: result.order.placed_at,
      },
      stages: result.stages,
      ...(result.error ? { error: result.error } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Status lookup failed.";
    const status = message === "Order not found." ? 404 : 500;
    return NextResponse.json({ error: { code: "status_failed", message } }, { status });
  }
}
