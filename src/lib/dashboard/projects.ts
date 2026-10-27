import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { listApiKeys } from "@/lib/api-keys/service";
import { getSmtpConfigSummary } from "@/lib/smtp/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TemplateService } from "@/lib/templates/service";

/** Message statuses grouped for dashboard stats (mirrors messages.describeStatus tones). */
export const MESSAGE_STATUS_GROUPS = {
  ok: ["accepted", "delivered"],
  attention: ["failed", "bounced", "complained", "delivery_delayed", "suppressed"],
  inFlight: ["queued", "sending"],
} as const;

export type StatusGroup = keyof typeof MESSAGE_STATUS_GROUPS;

export function groupMessageStatus(status: string): StatusGroup | "other" {
  for (const [group, members] of Object.entries(MESSAGE_STATUS_GROUPS)) {
    if ((members as readonly string[]).includes(status)) return group as StatusGroup;
  }
  return "other";
}

export type ProjectStats = {
  messagesTotal: number;
  ok: number;
  attention: number;
  inFlight: number;
  lastSentAt: string | null;
  templatesPublished: number;
  workflowsEnabled: number;
  keysActive: number;
  smtpConnected: boolean;
};

export function emptyStats(): ProjectStats {
  return {
    messagesTotal: 0,
    ok: 0,
    attention: 0,
    inFlight: 0,
    lastSentAt: null,
    templatesPublished: 0,
    workflowsEnabled: 0,
    keysActive: 0,
    smtpConnected: false,
  };
}

export type OwnedProject = {
  id: string;
  name: string;
  slug: string;
};

/**
 * Shared ownership gate for every dashboard project route: redirects
 * anonymous visitors to login, 404s on projects the user doesn't own.
 * Cached per request so layouts and pages share one lookup.
 */
export const requireOwnedProject = cache(async (projectId: string): Promise<OwnedProject> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Owner-scoped RLS does the isolation work here (Day 2 policies).
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) notFound();
  return project;
});

/** Bounded aggregate stats for project cards and the overview. Head-counts only. */
export async function getProjectStats(projectId: string): Promise<ProjectStats> {
  const supabase = await createSupabaseServerClient();
  const [ok, attention, inFlight, last, templates, workflows, keys, smtp] = await Promise.all([
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .in("status", [...MESSAGE_STATUS_GROUPS.ok]),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .in("status", [...MESSAGE_STATUS_GROUPS.attention]),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .in("status", [...MESSAGE_STATUS_GROUPS.inFlight]),
    supabase
      .from("messages")
      .select("created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    new TemplateService().listPublished(projectId),
    supabase.from("workflows").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("enabled", true),
    listApiKeys(projectId),
    getSmtpConfigSummary(projectId),
  ]);
  const okCount = ok.count ?? 0;
  const attentionCount = attention.count ?? 0;
  const inFlightCount = inFlight.count ?? 0;
  return {
    messagesTotal: okCount + attentionCount + inFlightCount,
    ok: okCount,
    attention: attentionCount,
    inFlight: inFlightCount,
    lastSentAt: last.data?.created_at ?? null,
    templatesPublished: templates.length,
    workflowsEnabled: workflows.count ?? 0,
    keysActive: keys.filter((key) => !key.revoked_at).length,
    smtpConnected: Boolean(smtp),
  };
}
