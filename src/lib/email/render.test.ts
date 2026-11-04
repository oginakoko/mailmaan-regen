import { describe, expect, it } from "vitest";
import {
  extractPlaceholders,
  renderTemplate,
  sanitizeEmailHtml,
  undeclaredPlaceholders,
  validateSubject,
  validateVariableValues,
  type VariablesSchema,
} from "./render";

describe("renderTemplate safety (Blueprint §10, §17)", () => {
  it("escapes variable values so they cannot inject markup or break attributes", () => {
    const rendered = renderTemplate({
      subject: "Hi {{name}}",
      html: `<p title="{{name}}">Hello {{name}}</p>`,
      values: { name: '"><script>alert(1)</script>' },
    });
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain('"><script>');
    // `<` from the value is always entity-encoded, so markup can never form.
    // (A raw `"` inside a *text node* is harmless; attribute values are
    // re-encoded by the serializer, so attributes cannot be terminated.)
    expect(rendered.html).toContain("&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(rendered.html).not.toContain('title=""');
    expect(rendered.subject).toBe('Hi "><script>alert(1)</script>'); // subject is text, escaped only in HTML
  });

  it("rejects CR/LF subject injection in templates and rendered output", () => {
    expect(validateSubject("Hello\r\nBcc: victim@example.com")).not.toHaveLength(0);
    expect(() =>
      renderTemplate({ subject: "Hi\r\nBcc: x@y.z", html: "<p>x</p>", values: {} }),
    ).toThrow(/line breaks/);
    expect(() =>
      renderTemplate({
        subject: "Hi {{name}}",
        html: "<p>x</p>",
        values: { name: "Asha\r\nBcc: victim@example.com" },
      }),
    ).toThrow(/line breaks/);
  });

  it("strips scripts, event handlers, forms and unsafe URLs from authored HTML", () => {
    const dirty = `<p onclick="steal()">Hi</p><script>alert(1)</script><form action="https://evil.example"><input></form><a href="javascript:alert(1)">click</a><img src="https://ok.example/x.png" onerror="pwn()">`;
    const clean = sanitizeEmailHtml(dirty);
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("<form");
    expect(clean).not.toContain("javascript:");
    expect(clean).toContain("https://ok.example/x.png");
    expect(clean).toContain("Hi");
  });

  it("sanitizes again at render time (stored hostile HTML cannot pass through)", () => {
    const rendered = renderTemplate({
      subject: "Receipt",
      html: `<p>Order {{orderId}}</p><script>alert(1)</script>`,
      values: { orderId: "ord_1" },
    });
    expect(rendered.html).not.toContain("<script");
    expect(rendered.html).toContain("Order ord_1");
  });

  it("extracts placeholders and derives a plain-text body", () => {
    expect(extractPlaceholders("Hi {{ firstName }}, order {{orderId}}")).toEqual([
      "firstName",
      "orderId",
    ]);
    const rendered = renderTemplate({
      subject: "Hi {{firstName}}",
      html: "<p>Hi {{firstName}}</p><p>Welcome.</p>",
      values: { firstName: "Asha" },
    });
    expect(rendered.text).toContain("Hi Asha");
    expect(rendered.text).toContain("Welcome.");
  });
});

describe("validateVariableValues (Blueprint §10, §15)", () => {
  const schema = {
    variables: [
      { name: "firstName", type: "string" as const, required: true },
      { name: "total", type: "number" as const, required: true },
      { name: "vip", type: "boolean" as const, required: false },
    ],
  };

  it("accepts complete, correctly typed values", () => {
    expect(validateVariableValues(schema, { firstName: "Asha", total: 49 })).toEqual([]);
  });

  it("reports missing required variables and type mismatches", () => {
    const issues = validateVariableValues(schema, { total: "49" });
    expect(issues).toContain("missing required variable: firstName");
    expect(issues).toContain("variable total must be a number");
  });

  it("flags undeclared variables instead of silently accepting them", () => {
    const issues = validateVariableValues(schema, {
      firstName: "Asha",
      total: 49,
      hacker: "<script>",
    });
    expect(issues).toContain("unknown variable supplied: hacker");
  });
});

describe("undeclaredPlaceholders", () => {
  const schema: VariablesSchema = {
    variables: [
      { name: "firstName", type: "string", required: true },
      { name: "orderId", type: "string", required: false },
    ],
  };

  it("returns an empty list when every placeholder is declared", () => {
    expect(
      undeclaredPlaceholders(["Hi {{firstName}}", "Order {{orderId}}", ""], schema),
    ).toEqual([]);
  });

  it("reports new placeholders across subject, html and text bodies", () => {
    expect(
      undeclaredPlaceholders(
        ["Hi {{firstName}}", '<a href="{{trackingUrl}}">track</a>', "Quote: {{quote}}"],
        schema,
      ),
    ).toEqual(["trackingUrl", "quote"]);
  });

  it("dedupes repeated placeholders and ignores declared ones", () => {
    expect(
      undeclaredPlaceholders(["{{link}} and {{link}}", "{{firstName}} {{link}}", ""], schema),
    ).toEqual(["link"]);
  });
});
