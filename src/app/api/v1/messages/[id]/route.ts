import { NextResponse } from "next/server";
import { ApiKeyAuthError, authenticateApiKey, requireScope } from "@/lib/api-keys/service";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * GET /v1/messages/:id (Blueprint §7) — requires read scope.
 * Returns the stored message plus its sanitized event timeline. Messages
 * from other projects return 404 (no existence leak). Status never exceeds
 * what provider evidence supports — today that tops out at `accepted`.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authHeader = request.headers.get("authorization") ?? "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  const requestId = crypto.randomUUID();

  try {
    const auth = await authenticateApiKey(rawKey);
    requireScope(auth, "read");
    const { id } = await context.params;

    const db = createSupabaseServiceClient();
    const { data: message, error } = await db
      .from("messages")
      .select(
        "id, project_id, template_id, template_version, recipient_email, from_email, subject, status, provider, provider_message_id, idempotency_key, error_code, error_message, queued_at, accepted_at, delivered_at, failed_at, metadata, created_at, updated_at",
      )
      .eq("id", id)
      .eq("project_id", auth.project.id)
      .maybeSingle();
    if (error) throw new Error(`Message lookup failed: ${error.message}`);
    if (!message) {
      return NextResponse.json(
        { error: { code: "message_not_found", message: "Message not found.", request_id: requestId } },
        { status: 404 },
      );
    }

    const { data: events, error: eventsError } = await db
      .from("message_events")
      .select("id, source, event_type, occurred_at, received_at, payload_redacted")
      .eq("message_id", id)
      .order("received_at", { ascending: true });
    if (eventsError) throw new Error(`Timeline lookup failed: ${eventsError.message}`);

    return NextResponse.json({ message, timeline: events ?? [] });
  } catch (error) {
    if (error instanceof ApiKeyAuthError) {
      console.error("[messages] GET failed", { code: error.code, request_id: requestId });
      return NextResponse.json(
        { error: { code: error.code, message: error.message, request_id: requestId } },
        { status: 401 },
      );
    }
    console.error("[messages] GET failed", {
      code: "internal_error",
      request_id: requestId,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: "Unexpected error while reading the message.",
          request_id: requestId,
        },
      },
      { status: 500 },
    );
  }
}
