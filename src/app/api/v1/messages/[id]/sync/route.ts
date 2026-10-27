import { NextResponse } from "next/server";
import { ApiKeyAuthError, authenticateApiKey, requireScope } from "@/lib/api-keys/service";
import { enforceRateLimit } from "@/lib/rate-limit/service";
import { MessageSyncError, syncMessageFromUpstream } from "@/lib/email/status-sync";

/**
 * POST /v1/messages/:id/sync (Day 5 observability) — requires read scope.
 * Reads the provider's status for one message, journals the read, and
 * applies genuine state changes to the canonical timeline. Never invents
 * delivery: upstream `sent` only confirms `accepted`.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authHeader = _request.headers.get("authorization") ?? "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  const requestId = crypto.randomUUID();

  try {
    const auth = await authenticateApiKey(rawKey);
    requireScope(auth, "read");
    const limited = await enforceRateLimit(rawKey ?? "", "write", requestId);
    if (limited) return limited;
    const { id } = await context.params;
    const result = await syncMessageFromUpstream(auth.project.id, id);
    return NextResponse.json({
      message_id: result.message_id,
      status: result.status,
      outcome: result.outcome,
      upstream: result.upstream,
      status_url: `/v1/messages/${result.message_id}`,
    });
  } catch (error) {
    if (error instanceof ApiKeyAuthError) {
      console.error("[messages-sync] POST failed", { code: error.code, request_id: requestId });
      return NextResponse.json(
        { error: { code: error.code, message: error.message, request_id: requestId } },
        { status: 401 },
      );
    }
    if (error instanceof MessageSyncError) {
      console.error("[messages-sync] POST failed", {
        code: error.code,
        status: error.status,
        request_id: requestId,
      });
      return NextResponse.json(
        { error: { code: error.code, message: error.message, request_id: requestId } },
        { status: error.status },
      );
    }
    console.error("[messages-sync] POST failed", {
      code: "internal_error",
      request_id: requestId,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: "Unexpected error while syncing message status.",
          request_id: requestId,
        },
      },
      { status: 500 },
    );
  }
}
