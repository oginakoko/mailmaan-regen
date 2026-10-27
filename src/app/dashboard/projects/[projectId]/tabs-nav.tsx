"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { ProjectTabs, type ProjectTab } from "@/components/ui/tabs";

const SEGMENT_TAB: Record<string, ProjectTab> = {
  templates: "templates",
  workflows: "workflows",
  messages: "messages",
  keys: "keys",
  smtp: "smtp",
};

/** Tab bar that highlights from the current route segment (works for nested pages too). */
export function ProjectTabsNav({ projectId }: { projectId: string }) {
  const segment = useSelectedLayoutSegment();
  const active: ProjectTab = (segment && SEGMENT_TAB[segment]) || "overview";
  return <ProjectTabs projectId={projectId} active={active} />;
}
