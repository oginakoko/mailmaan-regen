import { NextResponse } from "next/server";
import { ApiKeyAuthError, authenticateApiKey, requireScope } from "@/lib/api-keys/service";
import { ingestEvent, WorkflowError } from "@/lib/workflows/service";

/**
 * POST /v1/events (Blueprint §7) — requires events scope.
 * Persists the app event, matches enabled workflows, and executes due
 * runs inline. External ids replay idempotently without re-triggering.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  const requestId = crypto.randomUUID();

  try {
    const auth = await authenticateApiKey(rawKey);
    requireScope(auth, "events");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "invalid_json", message: "Request body must be valid JSON.", request_id: requestId } },
        { status: 400 },
      );
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: { code: "invalid_body", message: "Request body must be an object.", request_id: requestId } },
        { status: 400 },
      );
    }
    const { id, name, data } = body as Record<string, unknown>;
    const result = await ingestEvent(
      auth.project.id,
      {
        externalId: typeof id === "string" ? id : undefined,
        name: typeof name === "string" ? name : "",
        data: data ?? {},
      },
      { requestId },
    );
    return NextResponse.json(
      {
        id: result.id,
        name: result.name,
        dispatch_status: result.dispatch_status,
        replayed: result.replayed,
        runs: result.runs,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof ApiKeyAuthError) {
      console.error("[events] POST failed", { code: error.code, request_id: requestId });
      return NextResponse.json(
        { error: { code: error.code, message: error.message, request_id: requestId } },
        { status: 401 },
      );
    }
    if (error instanceof WorkflowError) {
      console.error("[events] POST failed", {
        code: error.code,
        status: error.status,
        request_id: requestId,
      });
      return NextResponse.json(
        { error: { code: error.code, message: error.message, request_id: requestId } },
        { status: error.status },
      );
    }
    console.error("[events] POST failed", {
      code: "internal_error",
      request_id: requestId,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: "Unexpected error while ingesting the event.",
          request_id: requestId,
        },
      },
      { status: 500 },
    );
  }
}
