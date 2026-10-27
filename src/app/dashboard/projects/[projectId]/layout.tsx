import Link from "next/link";
import { Suspense } from "react";
import { requireOwnedProject } from "@/lib/dashboard/projects";
import { ProjectTabsNav } from "./tabs-nav";

async function ProjectHeader({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireOwnedProject(projectId);
  return (
    <>
      <p className="text-sm">
        <Link href="/dashboard" className="font-medium text-[#1c1917]/55 underline underline-offset-4 hover:text-[#1c1917]">
          ← All projects
        </Link>
      </p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-display text-3xl font-medium tracking-tight">{project.name}</h1>
        <p className="font-mono text-xs text-[#1c1917]/50">{project.slug}</p>
      </div>
      <div className="mt-4">
        <ProjectTabsNav projectId={project.id} />
      </div>
    </>
  );
}

function ProjectHeaderSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="h-4 w-24 animate-pulse rounded bg-[#1c1917]/10" />
      <div className="h-9 w-64 animate-pulse rounded-lg bg-[#1c1917]/10" />
      <div className="h-11 animate-pulse rounded-lg bg-[#1c1917]/10" />
    </div>
  );
}

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 pt-8">
      <Suspense fallback={<ProjectHeaderSkeleton />}>
        <ProjectHeader params={params} />
      </Suspense>
      <div className="flex flex-1 flex-col py-8">{children}</div>
    </div>
  );
}
