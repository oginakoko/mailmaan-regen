import Link from "next/link";

const NAV = [
  { href: "/docs/developer-guide", title: "Developer guide", note: "5-minute setup, event rules, agent path" },
  { href: "/docs/soko-demo", title: "Soko demo build", note: "How the example store works" },
  { href: "/docs/api", title: "API reference", note: "Endpoints, scopes, errors" },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#faf7f0] font-body text-[#1c1917]">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[#1c1917]/15 pb-4">
          <Link href="/" className="font-display text-2xl tracking-tight">
            Mailmaan
          </Link>
          <nav className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-medium">
            <Link href="/" className="text-[#1c1917]/60 hover:text-[#1c1917]">
              Home
            </Link>
            <a href="/demo/soko" className="text-[#1c1917]/60 hover:text-[#1c1917]">
              Live demo
            </a>
            <a href="/dashboard" className="text-[#1c1917]/60 hover:text-[#1c1917]">
              Dashboard
            </a>
            <Link href="/about" className="text-[#1c1917]/60 hover:text-[#1c1917]">
              About
            </Link>
          </nav>
        </header>
        <div className="mt-8 grid gap-10 lg:grid-cols-[240px_1fr]">
          <aside>
            <nav className="space-y-1 lg:sticky lg:top-8">
              <p className="px-3 pb-2 text-xs tracking-[0.2em] text-[#1c1917]/50">DOCS</p>
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-md px-3 py-2.5 transition-colors hover:bg-[#1c1917]/5"
                >
                  <span className="block text-[15px] font-semibold">{item.title}</span>
                  <span className="block text-sm text-[#1c1917]/60">{item.note}</span>
                </Link>
              ))}
            </nav>
          </aside>
          <main className="min-w-0 pb-20">{children}</main>
        </div>
      </div>
    </div>
  );
}
