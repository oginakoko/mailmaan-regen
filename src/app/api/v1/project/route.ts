import { NextResponse } from "next/server";
import { ApiKeyAuthError, authenticateApiKey, requireScope } from "@/lib/api-keys/service";
import { enforceRateLimit } from "@/lib/rate-limit/service";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * GET /v1/project (Blueprint §7) — requires a project API key with read permission.
 * Returns minimal project configuration only; never secret values.
 * Project identity is derived from the stored key record (Blueprint §6).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  const requestId = crypto.randomUUID();

  try {
    const auth = await authenticateApiKey(rawKey);
    requireScope(auth, "read");
    const limited = await enforceRateLimit(rawKey ?? "", "read", requestId);
    if (limited) return limited;
    const db = createSupabaseServiceClient();
    const { data: smtp } = await db
      .from("project_smtp_configs")
      .select("id")
      .eq("project_id", auth.project.id)
      .maybeSingle();
    return NextResponse.json({
      id: auth.project.id,
      name: auth.project.name,
      slug: auth.project.slug,
      status: auth.project.status,
      capabilities: [...new Set(["read", ...auth.key.scopes])],
      sender_configured: Boolean(smtp),
    });
  } catch (error) {
    if (error instanceof ApiKeyAuthError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            request_id: requestId,
          },
        },
        { status: 401 },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: "Unexpected error while authenticating the API key.",
          request_id: requestId,
        },
      },
      { status: 500 },
    );
  }
}
