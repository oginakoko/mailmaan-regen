import { NextResponse } from "next/server";
import { ApiKeyAuthError, authenticateApiKey, requireScope } from "@/lib/api-keys/service";
import { enforceRateLimit } from "@/lib/rate-limit/service";
import { reconcileProject, WorkflowError } from "@/lib/workflows/service";

/**
 * POST /v1/events/reconcile (Day 6) — requires events scope.
 * Replays events stuck `pending` and executes delayed runs past their due
 * time. Safe to call repeatedly; per-project only.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  const requestId = crypto.randomUUID();

  try {
    const auth = await authenticateApiKey(rawKey);
    requireScope(auth, "events");
    const limited = await enforceRateLimit(rawKey ?? "", "write", requestId);
    if (limited) return limited;
    const result = await reconcileProject(auth.project.id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiKeyAuthError) {
      console.error("[events-reconcile] POST failed", { code: error.code, request_id: requestId });
      return NextResponse.json(
        { error: { code: error.code, message: error.message, request_id: requestId } },
        { status: 401 },
      );
    }
    if (error instanceof WorkflowError) {
      console.error("[events-reconcile] POST failed", {
        code: error.code,
        status: error.status,
        request_id: requestId,
      });
      return NextResponse.json(
        { error: { code: error.code, message: error.message, request_id: requestId } },
        { status: error.status },
      );
    }
    console.error("[events-reconcile] POST failed", {
      code: "internal_error",
      request_id: requestId,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: "Unexpected error while reconciling events.",
          request_id: requestId,
        },
      },
      { status: 500 },
    );
  }
}
