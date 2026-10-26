import { describe, expect, it } from "vitest";
import { SmtpConfigError, validateSmtpForm } from "./service";

const VALID = {
  host: "smtp.example.com",
  port: "587",
  secure: false,
  user: "sender@example.com",
  pass: "s3cr3t",
  from_email: "sender@example.com",
  from_name: "Example Sender",
};

describe("validateSmtpForm", () => {
  it("normalizes a complete valid form", () => {
    expect(validateSmtpForm(VALID)).toEqual({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      user: "sender@example.com",
      from_email: "sender@example.com",
      from_name: "Example Sender",
    });
  });

  it("trims whitespace and nulls an empty from name", () => {
    const result = validateSmtpForm({
      ...VALID,
      host: "  smtp.example.com ",
      user: " sender@example.com ",
      from_name: "   ",
    });
    expect(result.host).toBe("smtp.example.com");
    expect(result.user).toBe("sender@example.com");
    expect(result.from_name).toBeNull();
  });

  it("rejects missing or hostile hosts and ports", () => {
    expect(() => validateSmtpForm({ ...VALID, host: "" })).toThrow(SmtpConfigError);
    expect(() => validateSmtpForm({ ...VALID, host: "smtp .example.com" })).toThrow(
      SmtpConfigError,
    );
    expect(() => validateSmtpForm({ ...VALID, port: "not-a-port" })).toThrow(/port/);
    expect(() => validateSmtpForm({ ...VALID, port: "70000" })).toThrow(/port/);
    expect(() => validateSmtpForm({ ...VALID, user: "  " })).toThrow(/username/);
  });

  it("rejects invalid or header-injected from addresses", () => {
    expect(() => validateSmtpForm({ ...VALID, from_email: "not-an-email" })).toThrow(
      /From address/,
    );
    expect(() =>
      validateSmtpForm({
        ...VALID,
        from_email: "victim@example.com\r\nBcc: attacker@example.com",
      }),
    ).toThrow(/From address/);
  });

  it("strips quotes and newlines from the from name", () => {
    const result = validateSmtpForm({
      ...VALID,
      from_name: 'Evil"\r\nBcc: attacker@example.com',
    });
    expect(result.from_name).not.toMatch(/["\r\n]/);
  });
});
