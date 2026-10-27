import { NextResponse } from "next/server";
import { ApiKeyAuthError, authenticateApiKey, requireScope } from "@/lib/api-keys/service";
import { TEMPLATE_PURPOSES } from "@/lib/email/render";
import { enforceRateLimit } from "@/lib/rate-limit/service";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  generateTemplate,
  type BrandProfile,
} from "@/lib/templates/generation";
import { TemplateError, TemplateService } from "@/lib/templates/service";

/**
 * POST /v1/templates/generate — requires templates scope.
 * Generates ONE template draft from the project's brand profile (AI when
 * configured, otherwise a labelled deterministic fallback) and saves it
 * as a draft. Drafts never send: a human publishes from the dashboard.
 * Agents: generate once per email type, then reuse the published slug.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  const requestId = crypto.randomUUID();

  try {
    const auth = await authenticateApiKey(rawKey);
    requireScope(auth, "templates");
    const limited = await enforceRateLimit(rawKey ?? "", "write", requestId);
    if (limited) return limited;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "invalid_json", message: "Request body must be valid JSON.", request_id: requestId } },
        { status: 400 },
      );
    }
    const record = (body as Record<string, unknown> | null) ?? {};
    const purpose = record.purpose;
    if (typeof purpose !== "string" || !(TEMPLATE_PURPOSES as readonly string[]).includes(purpose)) {
      return NextResponse.json(
        {
          error: {
            code: "invalid_purpose",
            message: `Purpose must be one of: ${TEMPLATE_PURPOSES.join(", ")}.`,
            request_id: requestId,
          },
        },
        { status: 422 },
      );
    }
    const brief = typeof record.brief === "string" ? record.brief.slice(0, 500) : undefined;
    if (record.brief !== undefined && typeof record.brief !== "string") {
      return NextResponse.json(
        {
          error: {
            code: "invalid_brief",
            message: "Brief must be a string of at most 500 characters.",
            request_id: requestId,
          },
        },
        { status: 422 },
      );
    }

    const service = createSupabaseServiceClient();
    const { data: project } = await service
      .from("projects")
      .select("id, name, brand_config, default_from_email")
      .eq("id", auth.project.id)
      .maybeSingle();
    if (!project) throw new TemplateError("project_not_found", "Project not found.");

    const cfg = (project.brand_config ?? {}) as {
      app_name?: string;
      description?: string;
      tone?: string;
      colors?: { primary?: string; accent?: string; background?: string };
      logo_url?: string | null;
    };
    const brand: BrandProfile = {
      appName: cfg.app_name || project.name,
      description: cfg.description || "",
      tone: cfg.tone || "warm and concise",
      primaryColor: cfg.colors?.primary || "#0F172A",
      accentColor: cfg.colors?.accent || "#F59E0B",
      backgroundColor: cfg.colors?.background || "#ffffff",
      logoUrl: cfg.logo_url ?? null,
      supportEmail: project.default_from_email,
    };

    const { generatedBy, model, notes, ...draft } = await generateTemplate(auth.project.id, {
      brand,
      purpose: purpose as (typeof TEMPLATE_PURPOSES)[number],
      ...(brief ? { brief } : {}),
    });
    const generated = await new TemplateService().createDraft(auth.project.id, draft, {
      generated_by: generatedBy,
      model,
      notes,
    });

    return NextResponse.json(
      {
        template: {
          id: generated.id,
          slug: generated.slug,
          name: generated.name,
          purpose: generated.purpose,
          version: generated.version,
          status: generated.status,
          required_variables: generated.variables_schema.variables
            .filter((v) => v.required)
            .map((v) => v.name),
          variables: generated.variables_schema.variables,
        },
        generated_by: generatedBy,
        model,
        notes,
        dashboard_url: `/dashboard/projects/${auth.project.id}/templates`,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ApiKeyAuthError) {
      console.error("[templates-generate] POST failed", { code: error.code, request_id: requestId });
      return NextResponse.json(
        { error: { code: error.code, message: error.message, request_id: requestId } },
        { status: 401 },
      );
    }
    if (error instanceof TemplateError) {
      console.error("[templates-generate] POST failed", { code: error.code, request_id: requestId });
      return NextResponse.json(
        { error: { code: error.code, message: error.message, request_id: requestId } },
        { status: 422 },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Template generation rate limit")) {
      console.error("[templates-generate] POST throttled", { request_id: requestId });
      return NextResponse.json(
        { error: { code: "generation_rate_limited", message, request_id: requestId } },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }
    console.error("[templates-generate] POST failed", {
      code: "generation_failed",
      request_id: requestId,
      message,
    });
    return NextResponse.json(
      { error: { code: "generation_failed", message, request_id: requestId } },
      { status: 502 },
    );
  }
}
