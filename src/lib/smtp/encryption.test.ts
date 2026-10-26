import { describe, expect, it } from "vitest";
import {
  decryptSmtpSecret,
  encryptSmtpSecret,
  maskSmtpUser,
  parseEncryptionKey,
  SmtpCryptoError,
} from "./encryption";

const KEY_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const OTHER_KEY_HEX =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

describe("smtp encryption", () => {
  it("round-trips a secret and produces non-deterministic envelopes", () => {
    const key = parseEncryptionKey(KEY_HEX);
    const first = encryptSmtpSecret("s3cr3t-smtp-pass", key);
    const second = encryptSmtpSecret("s3cr3t-smtp-pass", key);
    expect(first).toMatch(/^v1:/);
    expect(second).not.toBe(first);
    expect(decryptSmtpSecret(first, key)).toBe("s3cr3t-smtp-pass");
    expect(decryptSmtpSecret(second, key)).toBe("s3cr3t-smtp-pass");
  });

  it("fails closed on a wrong key", () => {
    const envelope = encryptSmtpSecret("s3cr3t", parseEncryptionKey(KEY_HEX));
    expect(() => decryptSmtpSecret(envelope, parseEncryptionKey(OTHER_KEY_HEX))).toThrow(
      SmtpCryptoError,
    );
  });

  it("fails closed on tampered or malformed envelopes", () => {
    const key = parseEncryptionKey(KEY_HEX);
    const envelope = encryptSmtpSecret("s3cr3t", key);
    const tampered = `${envelope.slice(0, -2)}${envelope.endsWith("AA") ? "BB" : "AA"}`;
    expect(() => decryptSmtpSecret(tampered, key)).toThrow(SmtpCryptoError);
    expect(() => decryptSmtpSecret("not-an-envelope", key)).toThrow(SmtpCryptoError);
    expect(() => decryptSmtpSecret("v1:!!!", key)).toThrow(SmtpCryptoError);
  });

  it("rejects empty secrets and malformed keys", () => {
    const key = parseEncryptionKey(KEY_HEX);
    expect(() => encryptSmtpSecret("", key)).toThrow(SmtpCryptoError);
    expect(() => parseEncryptionKey("too-short")).toThrow(/64 hex/);
    expect(() => encryptSmtpSecret("x", Buffer.alloc(16))).toThrow(/32 bytes/);
  });

  it("masks usernames for display without leaking the local part", () => {
    expect(maskSmtpUser("sender@example.com")).toBe("se***@example.com");
    expect(maskSmtpUser("svc-account")).toBe("sv***");
  });
});
