import "server-only";
import { z } from "zod";
import { getServerEnv } from "../env";
import { templateDraftSchema, type TemplateDraft } from "../email/render";

/**
 * TemplateGenerationService (Blueprint §10).
 *
 * Provider: Meta Muse via the Meta Model API (https://api.meta.ai/v1,
 * OpenAI-compatible Chat Completions, Bearer `AI_API_KEY`). The model id is
 * always env-configured (`AI_TEMPLATE_MODEL`) — the user chose "Muse, a
 * cheap and lightweight model"; the exact id arrives with the API key.
 *
 * Contract (Blueprint §10): the model must return structured JSON validated
 * by Zod. Invalid output gets ONE bounded repair attempt, then a clear
 * failure. Malformed model output is never silently persisted. When no AI
 * key/model is configured, deterministic templates are returned and labelled
 * `generated_by: "fallback"` — never presented as AI output.
 *
 * Generation is server-side only and rate-limited per project (in-memory
 * token bucket; documented prototype limitation, resets on restart).
 */

export interface BrandProfile {
  appName: string;
  description: string;
  tone: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  logoUrl?: string | null;
  supportEmail?: string | null;
}

export interface GenerationInput {
  brand: BrandProfile;
  purpose: TemplateDraft["purpose"];
  requiredVariables?: string[];
  sampleValues?: Record<string, string>;
  /** Free-text author brief, e.g. "thank the buyer and ask for a review". */
  brief?: string;
}

export interface GeneratedTemplate extends TemplateDraft {
  generatedBy: "muse" | "fallback";
  model: string | null;
  notes: string;
}

const modelOutputSchema = templateDraftSchema.extend({
  notes: z.string().max(500).optional(),
});

const GENERATION_TIMEOUT_MS = 30_000;
const RATE_LIMIT_PER_MINUTE = 10;
const buckets = new Map<string, number[]>();

function rateLimited(projectId: string): boolean {
  const now = Date.now();
  const hits = (buckets.get(projectId) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= RATE_LIMIT_PER_MINUTE) return true;
  hits.push(now);
  buckets.set(projectId, hits);
  return false;
}

function buildPrompt(input: GenerationInput): string {
  const { brand, purpose } = input;
  return [
    "You are an email template designer for transactional email. Return ONLY a JSON object, no prose.",
    `App: ${brand.appName}. Description: ${brand.description || "(none)"}. Tone: ${brand.tone || "clear and friendly"}.`,
    `Colors: primary ${brand.primaryColor}, accent ${brand.accentColor}, background ${brand.backgroundColor}.`,
    brand.logoUrl ? `Logo URL: ${brand.logoUrl}` : "No logo.",
    brand.supportEmail ? `Support email: ${brand.supportEmail}` : "",
    `Purpose: ${purpose}.`,
    input.brief?.trim() ? `Author brief: ${input.brief.trim().slice(0, 500)}` : "",
    input.requiredVariables?.length
      ? `The template MUST use these variables: ${input.requiredVariables.join(", ")}.`
      : "Choose sensible variables for this purpose.",
    "Constraints: one-column responsive layout, email-safe HTML with inline styles and table layout, no JavaScript, no forms, no tracking pixels. Concise subject (max 80 chars, no line breaks). Include a plain-text version.",
    'JSON shape: {"name":string,"slug":string,"purpose":string,"subject":string,"html":string,"text":string,"variables":[{"name":string,"type":"string|number|boolean","description":string,"required":boolean,"example":string}],"previewData":{},"notes":string}',
    "Use {{variableName}} placeholders in subject/html/text. Escape nothing yourself; values are escaped at render time.",
  ]
    .filter(Boolean)
    .join("\n");
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Model response contained no JSON object.");
  return JSON.parse(text.slice(start, end + 1));
}

async function callMuse(input: GenerationInput, repairNote?: string): Promise<GeneratedTemplate> {
  const env = getServerEnv();
  const baseUrl = (env.AI_BASE_URL ?? "https://api.meta.ai/v1").replace(/\/$/, "");
  const path = env.AI_MODELS_PATH ?? "/chat/completions";
  const model = env.AI_TEMPLATE_MODEL as string;

  const prompt = repairNote
    ? `${buildPrompt(input)}\n\nYour previous output was invalid: ${repairNote}. Return corrected JSON only.`
    : buildPrompt(input);

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.AI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: 4000,
      messages: [
        { role: "system", content: "You generate transactional email templates as strict JSON." },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Muse API error (${response.status}): ${detail}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Muse API returned no message content.");

  const parsed = modelOutputSchema.safeParse(extractJson(content));
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  const { notes, ...draft } = parsed.data;
  return { ...draft, generatedBy: "muse", model, notes: notes ?? "" };
}

/** Deterministic welcome template (Blueprint §10 fallback, clearly labelled). */
export function fallbackWelcome(brand: BrandProfile): GeneratedTemplate {
  const primary = brand.primaryColor || "#0F172A";
  const accent = brand.accentColor || "#F59E0B";
  const bg = brand.backgroundColor || "#ffffff";
  const app = brand.appName || "our app";
  return {
    name: `Welcome to ${app}`,
    slug: "welcome",
    purpose: "welcome",
    subject: `Welcome to ${app}, {{firstName}}!`,
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};font-family:Arial,Helvetica,sans-serif;color:#111827;"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;"><tr><td style="background:${primary};color:#ffffff;padding:24px;border-radius:12px 12px 0 0;"><h1 style="margin:0;font-size:24px;">Welcome to ${app}</h1></td></tr><tr><td style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;"><p style="font-size:16px;line-height:1.6;">Hi {{firstName}},</p><p style="font-size:16px;line-height:1.6;">Thanks for joining ${app}. Your account is ready — here is what you can do next:</p><p style="margin:24px 0;"><a href="{{dashboardUrl}}" style="background:${accent};color:#111827;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:bold;">Open your dashboard</a></p><p style="font-size:14px;line-height:1.6;color:#4b5563;">Questions? Reply to this email and our team will help.</p></td></tr></table></td></tr></table>`,
    text: `Hi {{firstName}},\n\nWelcome to ${app}! Your account is ready.\n\nOpen your dashboard: {{dashboardUrl}}\n\nQuestions? Just reply to this email.`,
    variables: [
      { name: "firstName", type: "string", description: "Recipient first name", required: true, example: "Asha" },
      { name: "dashboardUrl", type: "string", description: "Link to the app dashboard", required: true, example: "https://soko.example/dashboard" },
    ],
    previewData: { firstName: "Asha", dashboardUrl: "https://soko.example/dashboard" },
    generatedBy: "fallback",
    model: null,
    notes: "Deterministic fallback template (no AI key configured). Labelled demo content per Blueprint §10.",
  };
}

/** Deterministic receipt template (Blueprint §10 fallback, clearly labelled). */
export function fallbackReceipt(brand: BrandProfile): GeneratedTemplate {
  const primary = brand.primaryColor || "#0F172A";
  const accent = brand.accentColor || "#F59E0B";
  const bg = brand.backgroundColor || "#ffffff";
  const app = brand.appName || "our store";
  return {
    name: `${app} order receipt`,
    slug: "receipt",
    purpose: "receipt",
    subject: `Your ${app} receipt — order {{orderId}}`,
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};font-family:Arial,Helvetica,sans-serif;color:#111827;"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;"><tr><td style="background:${primary};color:#ffffff;padding:24px;border-radius:12px 12px 0 0;"><h1 style="margin:0;font-size:24px;">Thanks for your order</h1></td></tr><tr><td style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;"><p style="font-size:16px;line-height:1.6;">Hi {{firstName}},</p><p style="font-size:16px;line-height:1.6;">Order <strong>{{orderId}}</strong> is confirmed. Total charged: <strong>{{currency}} {{total}}</strong>.</p><p style="margin:24px 0;"><a href="{{orderUrl}}" style="background:${accent};color:#111827;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:bold;">View your order</a></p><p style="font-size:14px;line-height:1.6;color:#4b5563;">Keep this email for your records.</p></td></tr></table></td></tr></table>`,
    text: `Hi {{firstName}},\n\nOrder {{orderId}} is confirmed. Total charged: {{currency}} {{total}}.\n\nView your order: {{orderUrl}}`,
    variables: [
      { name: "firstName", type: "string", description: "Recipient first name", required: true, example: "Asha" },
      { name: "orderId", type: "string", description: "Order identifier", required: true, example: "ord_1024" },
      { name: "total", type: "string", description: "Order total as displayed", required: true, example: "49.00" },
      { name: "currency", type: "string", description: "Currency code", required: true, example: "KES" },
      { name: "orderUrl", type: "string", description: "Link to the order page", required: true, example: "https://soko.example/orders/ord_1024" },
    ],
    previewData: {
      firstName: "Asha",
      orderId: "ord_1024",
      total: "49.00",
      currency: "KES",
      orderUrl: "https://soko.example/orders/ord_1024",
    },
    generatedBy: "fallback",
    model: null,
    notes: "Deterministic fallback template (no AI key configured). Labelled demo content per Blueprint §10.",
  };
}

export function fallbackTemplate(input: GenerationInput): GeneratedTemplate {
  if (input.purpose === "receipt") return fallbackReceipt(input.brand);
  if (input.purpose === "welcome") return fallbackWelcome(input.brand);
  // Generic purposes reuse the welcome structure with purpose-adjusted copy.
  const base = fallbackWelcome(input.brand);
  return {
    ...base,
    slug: input.purpose === "custom" ? "custom-email" : input.purpose.replace("_", "-"),
    name: `${input.brand.appName} ${input.purpose.replace("_", " ")} email`,
    purpose: input.purpose,
  };
}

/**
 * Generate a template draft. Uses Muse when AI_API_KEY + AI_TEMPLATE_MODEL
 * are configured; otherwise returns a deterministic labelled fallback.
 * One bounded repair attempt on invalid model output, then a clear failure.
 * Nothing here ever sends email — drafts require explicit publishing.
 */
export async function generateTemplate(
  projectId: string,
  input: GenerationInput,
): Promise<GeneratedTemplate> {
  if (rateLimited(projectId)) {
    throw new Error("Template generation rate limit exceeded for this project. Try again in a minute.");
  }
  const env = getServerEnv();
  const aiConfigured = Boolean(env.AI_API_KEY && env.AI_TEMPLATE_MODEL);
  if (!aiConfigured) return fallbackTemplate(input);

  try {
    return await callMuse(input);
  } catch (firstError) {
    // One bounded repair attempt (Blueprint §10), then fail clearly.
    return await callMuse(input, firstError instanceof Error ? firstError.message : "invalid output");
  }
}

export function generationConfigured(): { ai: boolean; model: string | null } {
  const env = getServerEnv();
  const ai = Boolean(env.AI_API_KEY && env.AI_TEMPLATE_MODEL);
  return { ai, model: ai ? (env.AI_TEMPLATE_MODEL as string) : null };
}
