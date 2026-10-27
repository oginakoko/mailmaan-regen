import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/lib/dashboard/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/ui/button";
import { SealMark } from "@/components/ui/logo";

async function DashboardUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return (
    <div className="flex items-center gap-3">
      {user?.email ? (
        <span className="hidden max-w-48 truncate text-xs text-[#1c1917]/50 lg:inline" title={user.email}>
          {user.email}
        </span>
      ) : null}
      <form action={signOut}>
        <SubmitButton variant="ghost" size="sm" pendingLabel="Signing out…">
          Sign out
        </SubmitButton>
      </form>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#faf7f0] font-body text-[#1c1917]">
      <header className="border-b border-[#1c1917]/10 bg-[#faf7f0]/95">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="Mailmaan dashboard">
            <SealMark className="h-7 w-7" />
            <span className="font-display text-xl tracking-tight">Mailmaan</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium text-[#1c1917]/60" aria-label="Product">
            <Link href="/" className="hidden transition-colors hover:text-[#1c1917] sm:inline">
              Home
            </Link>
            <Link href="/docs" className="hidden transition-colors hover:text-[#1c1917] sm:inline">
              Docs
            </Link>
            <Link href="/demo/soko" className="hidden transition-colors hover:text-[#1c1917] sm:inline">
              Live demo
            </Link>
            <Suspense
              fallback={
                <div className="h-9 w-20 animate-pulse rounded-full bg-[#1c1917]/10" aria-hidden="true" />
              }
            >
              <DashboardUser />
            </Suspense>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
