import Link from "next/link";

const TABS = [
  { key: "overview", label: "Overview", href: "" },
  { key: "templates", label: "Templates", href: "/templates" },
  { key: "workflows", label: "Workflows", href: "/workflows" },
  { key: "messages", label: "Messages", href: "/messages" },
  { key: "keys", label: "API keys", href: "/keys" },
  { key: "smtp", label: "Mailbox", href: "/smtp" },
] as const;

export type ProjectTab = (typeof TABS)[number]["key"];

/** Project sub-navigation. One tab bar on every project page replaces the scattered link lists. */
export function ProjectTabs({ projectId, active }: { projectId: string; active: ProjectTab }) {
  return (
    <nav aria-label="Project sections" className="flex gap-1 overflow-x-auto border-b border-[#1c1917]/10">
      {TABS.map((tab) => {
        const selected = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={`/dashboard/projects/${projectId}${tab.href}`}
            aria-current={selected ? "page" : undefined}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors ${
              selected
                ? "border-[#b3402a] text-[#1c1917]"
                : "border-transparent text-[#1c1917]/55 hover:border-[#1c1917]/20 hover:text-[#1c1917]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
