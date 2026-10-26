import { NextResponse } from "next/server";
import { ApiKeyAuthError, authenticateApiKey, requireScope } from "@/lib/api-keys/service";
import { TemplateService } from "@/lib/templates/service";

/**
 * GET /v1/templates (Blueprint §7) — requires read scope.
 * Lists published template metadata and required variables only.
 * Drafts are never exposed through the public API.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;

  try {
    const auth = await authenticateApiKey(rawKey);
    requireScope(auth, "read");
    const templates = await new TemplateService().listPublished(auth.project.id);
    return NextResponse.json({
      templates: templates.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        purpose: t.purpose,
        version: t.version,
        required_variables: t.variables_schema.variables.filter((v) => v.required).map((v) => v.name),
        variables: t.variables_schema.variables,
      })),
    });
  } catch (error) {
    if (error instanceof ApiKeyAuthError) {
      const requestId = crypto.randomUUID();
      console.error("[templates] GET failed", {
        code: error.code,
        request_id: requestId,
        message: error.message,
      });
      return NextResponse.json(
        { error: { code: error.code, message: error.message, request_id: requestId } },
        { status: 401 },
      );
    }
    const requestId = crypto.randomUUID();
    console.error("[templates] GET failed", {
      code: "internal_error",
      request_id: requestId,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: "Unexpected error while listing templates.",
          request_id: requestId,
        },
      },
      { status: 500 },
    );
  }
}
