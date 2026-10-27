import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col font-body">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-3">
          <Link href="/dashboard" className="font-display text-xl tracking-tight">
            Mailmaan
          </Link>
          <nav className="flex gap-5 text-sm font-medium text-zinc-500">
            <Link href="/" className="hover:text-zinc-900 dark:hover:text-zinc-100">
              Home
            </Link>
            <Link href="/docs" className="hover:text-zinc-900 dark:hover:text-zinc-100">
              Docs
            </Link>
            <Link href="/demo/soko" className="hover:text-zinc-900 dark:hover:text-zinc-100">
              Demo
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
