import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Banner } from "@/components/ui/banner";
import { SubmitButton } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { SealMark } from "@/components/ui/logo";
import { AuthTabs } from "./tabs";

async function signIn(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  }
  redirect(next.startsWith("/") ? next : "/dashboard");
}

async function signUp(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}&mode=signup`,
    );
  }
  // No session means email confirmation is required: say so instead of
  // bouncing the user through a confusing login loop.
  if (!data.session) {
    redirect(`/login?notice=verify-email&next=${encodeURIComponent(next)}`);
  }
  redirect(next.startsWith("/") ? next : "/dashboard");
}

const NOTICES: Record<string, { title: string; body: string }> = {
  "verify-email": {
    title: "Check your inbox to verify your email.",
    body: "Your account was created. Click the verification link, then sign in below.",
  },
};

async function LoginContent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; notice?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ?? "/dashboard";
  const notice = params.notice ? NOTICES[params.notice] : undefined;

  const signInForm = (
    <form action={signIn} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <TextField
        label="Email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        placeholder="••••••••"
      />
      <SubmitButton pendingLabel="Signing in…" className="w-full">
        Sign in
      </SubmitButton>
    </form>
  );

  const signUpForm = (
    <form action={signUp} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <TextField
        label="Email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        required
        autoComplete="new-password"
        placeholder="Choose a password"
        hint="At least 6 characters."
      />
      <SubmitButton pendingLabel="Creating account…" className="w-full">
        Create account
      </SubmitButton>
    </form>
  );

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-[#faf7f0] px-6 py-16 font-body text-[#1c1917]">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-3 text-center">
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Mailmaan home">
            <SealMark />
            <span className="font-display text-2xl tracking-tight">Mailmaan</span>
          </Link>
          <p className="text-sm leading-6 text-[#1c1917]/65">
            Dashboard access uses your Mailmaan account. Project API keys are
            separate and are managed after sign-in.
          </p>
        </div>

        {params.error ? <Banner tone="error">{params.error}</Banner> : null}
        {notice ? <Banner tone="info" title={notice.title}>{notice.body}</Banner> : null}

        <div className="rounded-2xl border border-[#1c1917]/10 bg-white p-6 shadow-sm">
          <AuthTabs
            signInForm={signInForm}
            signUpForm={signUpForm}
            initialTab={params.mode === "signup" ? "signup" : "signin"}
          />
        </div>

        <p className="text-center text-xs text-[#1c1917]/50">
          Just looking? <Link href="/demo/soko" className="font-semibold underline underline-offset-4">Fly the live demo</Link> — no account needed.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; notice?: string; mode?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 flex-col items-center justify-center bg-[#faf7f0] px-6 py-24">
          <p className="text-sm text-[#1c1917]/55">Loading sign-in…</p>
        </main>
      }
    >
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}
