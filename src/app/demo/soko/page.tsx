import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { fireDemoStageEvent, type DemoOrder } from "@/lib/demo/soko";

const PRODUCT = {
  name: "Soko Coffee AA",
  detail: "500 g whole bean · Kiambu highlands",
  price: 1850,
  currency: "KES",
  notes: "Washed process, blackcurrant and brown sugar. Roasted every Tuesday in Nairobi.",
};

function orderNumber(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 6; i += 1) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `SOKO-${suffix}`;
}

async function checkoutAction(formData: FormData): Promise<void> {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const qty = Math.min(5, Math.max(1, Number.parseInt(String(formData.get("qty") ?? "1"), 10) || 1));
  if (!email || !email.includes("@")) redirect("/demo/soko?error=Enter%20a%20valid%20email%20address.");
  if (!firstName) redirect("/demo/soko?error=Enter%20your%20first%20name.");

  const db = createSupabaseServiceClient();
  const { data: project } = await db.from("projects").select("id").eq("slug", "demo-soko-judges").maybeSingle();
  if (!project) redirect("/demo/soko?error=Demo%20project%20is%20missing.");
  // Public demo form with no recipient allowlist: throttle per address so
  // the store cannot be used as a bulk sender. Legit testing is unaffected.
  const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count: recentOrders } = await db
    .from("demo_orders")
    .select("id", { count: "exact", head: true })
    .eq("project_id", project.id)
    .eq("email", email)
    .gte("placed_at", hourAgo);
  if ((recentOrders ?? 0) >= 3) {
    redirect("/demo/soko?error=Demo%20limit%3A%203%20orders%20per%20hour%20per%20email.");
  }
  const { data: order, error } = await db
    .from("demo_orders")
    .insert({
      project_id: project.id,
      order_number: orderNumber(),
      email,
      first_name: firstName,
      total: String(PRODUCT.price * qty),
      currency: PRODUCT.currency,
    })
    .select("*")
    .single();
  if (error || !order) redirect("/demo/soko?error=Could%20not%20create%20the%20order.");
  const created = order as DemoOrder;
  // Fire through the public API like any customer integration would.
  const fired = await fireDemoStageEvent(created, "order.paid", "confirmed");
  if (!fired.ok) {
    await db.from("demo_orders").delete().eq("id", created.id);
    redirect(`/demo/soko?error=${encodeURIComponent(fired.message ?? "Checkout email failed.")}`);
  }
  redirect(`/demo/soko/track/${created.id}`);
}

async function SokoStoreContent({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  return (
    <main className="min-h-screen bg-[#f4f4f0] text-stone-900">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <header className="flex items-baseline justify-between border-b border-stone-300 pb-4">
          <p className="font-serif text-2xl tracking-tight">Soko</p>
          <p className="text-sm text-stone-500">Demo store · no payment · emails straight to your inbox</p>
        </header>

        {query.error ? (
          <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{query.error}</p>
        ) : null}

        <div className="mt-8 grid gap-10 md:grid-cols-2">
          <section className="overflow-hidden rounded-lg bg-[#1a7f37] p-8 text-white">
            <p className="text-xs tracking-[0.25em] text-emerald-100">SINGLE ORIGIN · KENYA</p>
            <h1 className="mt-3 font-serif text-4xl leading-tight">{PRODUCT.name}</h1>
            <p className="mt-1 text-sm text-emerald-100">{PRODUCT.detail}</p>
            <p className="mt-6 max-w-sm font-serif text-lg italic leading-relaxed text-emerald-50">
              “{PRODUCT.notes}”
            </p>
            <p className="mt-8 font-serif text-3xl">
              {PRODUCT.currency} {PRODUCT.price.toLocaleString()}
            </p>
            <p className="text-sm text-emerald-100">per 500 g bag · free demo delivery</p>
          </section>

          <section className="rounded-lg border border-stone-300 bg-white p-6">
            <h2 className="font-serif text-2xl">Checkout</h2>
            <p className="mt-1 text-sm text-stone-500">
              No payment — this demo walks one order through a five-minute
              delivery life, one email per stage.
            </p>
            <form action={checkoutAction} className="mt-5 space-y-4">
              <label className="block space-y-1 text-sm">
                <span className="font-medium">First name</span>
                <input
                  name="firstName"
                  required
                  placeholder="Wanjiku"
                  className="w-full rounded-md border border-stone-300 px-3 py-2"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Email for order updates</span>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  className="w-full rounded-md border border-stone-300 px-3 py-2"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Bags (1–5)</span>
                <input
                  name="qty"
                  type="number"
                  min={1}
                  max={5}
                  defaultValue={1}
                  className="w-full rounded-md border border-stone-300 px-3 py-2"
                />
              </label>
              <button
                type="submit"
                className="w-full rounded-md bg-stone-900 px-5 py-3 text-sm font-medium text-white hover:bg-stone-700"
              >
                Place order — {PRODUCT.currency} {PRODUCT.price.toLocaleString()} / bag
              </button>
            </form>
          </section>
        </div>

        <section className="mt-10 border-t border-stone-300 pt-6 text-sm leading-7 text-stone-600">
          <h2 className="font-serif text-xl text-stone-900">How this demo works</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Checkout fires an <code>order.paid</code> event — you get the receipt email.</li>
            <li>The tracking page advances the order one stage per minute: packed, shipped, out for delivery, delivered, then an automatic thank-you with your products and a quote — one email each.</li>
            <li>Every template here was generated by the AI from a short brief — then reused for every order.</li>
            <li>At the end, brief the AI yourself for a custom one-off email — then send it.</li>
            <li>Every send lands in the Mailmaan dashboard with a truthful timeline.</li>
          </ol>
        </section>
      </div>
    </main>
  );
}

export default function SokoStorePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f4f4f0] text-stone-900">
          <div className="mx-auto w-full max-w-5xl px-6 py-10">
            <p className="text-sm text-stone-500">Loading Soko…</p>
          </div>
        </main>
      }
    >
      <SokoStoreContent searchParams={searchParams} />
    </Suspense>
  );
}
