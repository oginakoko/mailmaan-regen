import { describe, expect, it } from "vitest";
import { fallbackReceipt, fallbackWelcome, type BrandProfile } from "./generation";

const soko: BrandProfile = {
  appName: "Soko",
  description: "Kenyan storefront",
  tone: "warm and concise",
  primaryColor: "#0F172A",
  accentColor: "#F59E0B",
  backgroundColor: "#ffffff",
  supportEmail: "hello@soko.example",
};

describe("deterministic fallback templates (Blueprint §10, Day 3)", () => {
  it("welcome is labelled fallback, brand-matched, and safe by default", () => {
    const t = fallbackWelcome(soko);
    expect(t.generatedBy).toBe("fallback");
    expect(t.model).toBeNull();
    expect(t.slug).toBe("welcome");
    expect(t.html).toContain("#0F172A");
    expect(t.html).toContain("Soko");
    expect(t.html).not.toContain("<script");
    expect(t.subject).not.toMatch(/[\r\n]/);
    expect(t.variables.filter((v) => v.required).map((v) => v.name)).toEqual([
      "firstName",
      "dashboardUrl",
    ]);
    expect(t.previewData?.firstName).toBe("Asha");
  });

  it("receipt declares every variable its subject/body use", () => {
    const t = fallbackReceipt(soko);
    expect(t.generatedBy).toBe("fallback");
    expect(t.purpose).toBe("receipt");
    const declared = new Set(t.variables.map((v) => v.name));
    for (const used of ["firstName", "orderId", "total", "currency", "orderUrl"]) {
      expect(declared.has(used)).toBe(true);
    }
    expect(t.subject).toContain("{{orderId}}");
  });

  it("is deterministic — same brand in, same template out", () => {
    expect(fallbackWelcome(soko)).toEqual(fallbackWelcome(soko));
    expect(fallbackReceipt(soko)).toEqual(fallbackReceipt(soko));
  });
});
