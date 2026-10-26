import { NextResponse } from "next/server";
import { ApiKeyAuthError, authenticateApiKey, requireScope } from "@/lib/api-keys/service";
import { EmailSendError, queueEmailSend } from "@/lib/email/send";

/**
 * POST /v1/emails (Blueprint §7) — requires send scope + Idempotency-Key.
 * Validates, renders the published template, delivers via the Mailmaan
 * service with the project's SMTP mailbox, and persists the message plus a
 * truthful queued → accepted/failed timeline. Returns 202 with the stored
 * status; replays return the existing message without re-sending.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || "";
  const requestId = crypto.randomUUID();

  try {
    const auth = await authenticateApiKey(rawKey);
    requireScope(auth, "send");

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
    const { to, template, variables, metadata, from } = body as Record<string, unknown>;

    const result = await queueEmailSend({
      projectId: auth.project.id,
      to: typeof to === "string" ? to : "",
      template: typeof template === "string" ? template : "",
      variables: (variables ?? {}) as Record<string, unknown>,
      metadata: (metadata ?? {}) as Record<string, unknown>,
      from: typeof from === "string" ? from : undefined,
      idempotencyKey,
    });

    return NextResponse.json(
      {
        id: result.id,
        status: result.status,
        status_url: `/v1/messages/${result.id}`,
        replayed: result.replayed,
        ...(result.provider_message_id ? { provider_message_id: result.provider_message_id } : {}),
        ...(result.error_code ? { error_code: result.error_code } : {}),
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof ApiKeyAuthError) {
      console.error("[emails] POST failed", { code: error.code, request_id: requestId });
      return NextResponse.json(
        { error: { code: error.code, message: error.message, request_id: requestId } },
        { status: 401 },
      );
    }
    if (error instanceof EmailSendError) {
      console.error("[emails] POST failed", {
        code: error.code,
        status: error.status,
        request_id: requestId,
      });
      return NextResponse.json(
        { error: { code: error.code, message: error.message, request_id: requestId } },
        { status: error.status },
      );
    }
    console.error("[emails] POST failed", {
      code: "internal_error",
      request_id: requestId,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: "Unexpected error while sending email.",
          request_id: requestId,
        },
      },
      { status: 500 },
    );
  }
}
