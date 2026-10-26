import { describe, expect, it } from "vitest";
import {
  API_KEY_PREFIX,
  generateApiKeySecret,
  hashesEqual,
} from "./service";

describe("API key generation", () => {
  it("generates a prefixed, high-entropy key and stores only its hash", () => {
    const a = generateApiKeySecret();
    const b = generateApiKeySecret();
    expect(a.rawKey.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(a.rawKey).not.toBe(b.rawKey);
    expect(a.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.keyHash).not.toContain(a.rawKey);
    expect(a.prefix).toBe(a.rawKey.slice(0, API_KEY_PREFIX.length + 8));
    expect(a.prefix).not.toBe(a.rawKey);
  });

  it("compares hashes in a length-safe way", () => {
    expect(hashesEqual("abc", "abc")).toBe(true);
    expect(hashesEqual("abc", "abd")).toBe(false);
    expect(hashesEqual("abc", "abcd")).toBe(false);
  });
});
