import "server-only";
import { createSupabaseServiceClient } from "../supabase/service";

/**
 * Suppression list (Day 9 hardening, Blueprint §7 states).
 *
 * Suppressed recipients never receive mail: the send pipeline persists a
 * `suppressed` message (no provider call) instead of sending. Entries use
 * the Day-1 `suppression_entries` schema (`recipient_email`, checked
 * `reason`) and are added automatically on upstream bounces/complaints;
 * there is currently no manual management UI (documented gap).
 */

export type SuppressionReason = "hard_bounce" | "complaint" | "manual" | "unsubscribe";

export function normalizeSuppressionEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function isSuppressed(projectId: string, email: string): Promise<boolean> {
  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from("suppression_entries")
    .select("id")
    .eq("project_id", projectId)
    .eq("recipient_email", normalizeSuppressionEmail(email))
    .maybeSingle();
  if (error) throw new Error(`Suppression lookup failed: ${error.message}`);
  return Boolean(data);
}

/** Idempotent: re-suppressing updates reason/note, never duplicates. */
export async function suppressEmail(
  projectId: string,
  email: string,
  reason: SuppressionReason,
  opts?: { sourceMessageId?: string; note?: string },
): Promise<void> {
  const db = createSupabaseServiceClient();
  const { error } = await db.from("suppression_entries").upsert(
    {
      project_id: projectId,
      recipient_email: normalizeSuppressionEmail(email),
      reason,
      source_message_id: opts?.sourceMessageId ?? null,
      note: opts?.note?.slice(0, 500) ?? null,
    },
    { onConflict: "project_id,recipient_email" },
  );
  if (error) throw new Error(`Failed to record suppression: ${error.message}`);
}
