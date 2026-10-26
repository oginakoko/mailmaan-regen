import sanitizeHtml from "sanitize-html";
import { z } from "zod";

/**
 * Safe template rendering (Blueprint §10 rendering/safety, §17 controls).
 *
 * Templates are authored with `{{variable}}` placeholders. Variable values
 * are always HTML-escaped before insertion so a value can never terminate an
 * attribute or inject markup. The template HTML itself is sanitized with an
 * allowlist (no scripts, event handlers, unsafe URLs) both at save time and
 * again at render time — defense in depth, because preview and the real
 * email must use the same stored template.
 */

export const TEMPLATE_PURPOSES = [
  "welcome",
  "password_reset",
  "receipt",
  "notification",
  "custom",
] as const;
export type TemplatePurpose = (typeof TEMPLATE_PURPOSES)[number];

export const templateVariableSchema = z.object({
  name: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/, "variable name must start with a letter"),
  type: z.enum(["string", "number", "boolean"]).default("string"),
  description: z.string().max(300).optional(),
  required: z.boolean().default(false),
  example: z.union([z.string(), z.number(), z.boolean()]).optional(),
});
export type TemplateVariable = z.infer<typeof templateVariableSchema>;

export const variablesSchemaSchema = z.object({
  variables: z.array(templateVariableSchema).max(50).default([]),
});
export type VariablesSchema = z.infer<typeof variablesSchemaSchema>;

export const templateDraftSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-_]*$/, "slug must be lowercase letters, numbers, dashes"),
  name: z.string().trim().min(1).max(120),
  purpose: z.enum(TEMPLATE_PURPOSES),
  subject: z.string().trim().min(1).max(200),
  html: z.string().min(1).max(200_000),
  text: z.string().max(200_000).optional(),
  variables: z.array(templateVariableSchema).max(50).default([]),
  previewData: z.record(z.string(), z.unknown()).optional(),
});
export type TemplateDraft = z.infer<typeof templateDraftSchema>;

const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Extract unique `{{placeholder}}` names from any template body. */
export function extractPlaceholders(body: string): string[] {
  const names = new Set<string>();
  for (const match of body.matchAll(PLACEHOLDER)) names.add(match[1]);
  return [...names];
}

export function validateSubject(subject: string): string[] {
  const issues: string[] = [];
  if (/[\r\n]/.test(subject)) issues.push("subject must not contain line breaks (CR/LF injection)");
  if (subject.length > 200) issues.push("subject must be 200 characters or fewer");
  return issues;
}

/**
 * Allowlist equivalent to the previous DOMPurify `USE_PROFILES: { html: true }`
 * minus the forbidden tags below. `sanitize-html` is pure JS, so importing this
 * module no longer loads jsdom at module scope (which crashed serverless
 * functions before the handler ran). Tags not listed — notably `script`,
 * `style`, `iframe`, `form`, `object`, `embed`, `link`, `meta`, `base` — are
 * discarded, and only attributes listed here survive, so `on*` handlers,
 * `formaction`, and `xlink:href` can never pass through.
 */
const ALLOWED_TAGS = [
  "a", "abbr", "address", "article", "aside", "audio", "b", "bdi", "bdo",
  "blockquote", "br", "caption", "cite", "code", "col", "colgroup", "data",
  "dd", "del", "dfn", "div", "dl", "dt", "em", "figcaption", "figure",
  "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "i", "img",
  "ins", "kbd", "li", "main", "mark", "nav", "ol", "p", "picture", "pre",
  "q", "rp", "rt", "ruby", "s", "samp", "section", "small", "source", "span",
  "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead",
  "time", "track", "tr", "u", "ul", "var", "video", "wbr",
];

/** Sanitize authored HTML. Links must be http(s)/mailto; images http(s) only. */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      "*": [
        "align", "bgcolor", "border", "cellpadding", "cellspacing", "class",
        "color", "colspan", "dir", "height", "id", "lang", "rowspan", "scope",
        "span", "style", "title", "valign", "width",
      ],
      a: ["href", "hreflang", "name", "rel", "target", "type"],
      audio: ["controls", "loop", "muted", "preload", "src"],
      blockquote: ["cite"],
      del: ["cite", "datetime"],
      img: ["alt", "height", "loading", "src", "srcset", "title", "width"],
      ins: ["cite", "datetime"],
      li: ["value"],
      ol: ["reversed", "start", "type"],
      q: ["cite"],
      source: ["media", "sizes", "src", "srcset", "type"],
      td: ["abbr"],
      th: ["abbr"],
      time: ["datetime"],
      track: ["default", "kind", "label", "src", "srclang"],
      video: ["controls", "height", "loop", "muted", "poster", "preload", "src", "width"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    disallowedTagsMode: "discard",
  });
}

/**
 * Validate that supplied values satisfy the declared variables schema.
 * Returns human-readable issues; empty array means valid.
 */
export function validateVariableValues(
  schema: VariablesSchema,
  values: Record<string, unknown>,
): string[] {
  const issues: string[] = [];
  const declared = new Map(schema.variables.map((v) => [v.name, v]));
  for (const variable of schema.variables) {
    const value = values[variable.name];
    if (value === undefined || value === null || value === "") {
      if (variable.required) issues.push(`missing required variable: ${variable.name}`);
      continue;
    }
    if (variable.type === "number" && typeof value !== "number") {
      issues.push(`variable ${variable.name} must be a number`);
    }
    if (variable.type === "boolean" && typeof value !== "boolean") {
      issues.push(`variable ${variable.name} must be a boolean`);
    }
    if (variable.type === "string" && typeof value !== "string") {
      issues.push(`variable ${variable.name} must be a string`);
    }
  }
  for (const key of Object.keys(values)) {
    if (!declared.has(key)) issues.push(`unknown variable supplied: ${key}`);
  }
  return issues;
}

function substitute(body: string, values: Record<string, unknown>, escape: boolean): string {
  return body.replace(PLACEHOLDER, (_full, name: string) => {
    const value = values[name];
    if (value === undefined || value === null) return "";
    const raw = String(value);
    return escape ? escapeHtml(raw) : raw;
  });
}

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * Render a stored template. Variable values are escaped in HTML, raw in
 * subject/text. The rendered HTML is sanitized once more here so a stored
 * template can never smuggle unsafe markup into a real send.
 */
export function renderTemplate(input: {
  subject: string;
  html: string;
  text?: string | null;
  values: Record<string, unknown>;
}): RenderedTemplate {
  const subjectIssues = validateSubject(input.subject);
  if (subjectIssues.length) throw new Error(subjectIssues.join("; "));
  const subject = substitute(input.subject, input.values, false);
  if (/[\r\n]/.test(subject)) {
    throw new Error("rendered subject contains line breaks (CR/LF injection)");
  }
  const html = sanitizeEmailHtml(substitute(input.html, input.values, true));
  const text = input.text
    ? substitute(input.text, input.values, false)
    : htmlToText(html);
  return { subject, html, text };
}

/** Minimal HTML → text fallback when no plain-text body was authored. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
