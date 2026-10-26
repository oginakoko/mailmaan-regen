import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getServerEnv } from "../env";

/**
 * SMTP credential encryption (ADR-0002, Blueprint §6).
 *
 * AES-256-GCM with a server-only key (`MAILMAAN_SMTP_ENCRYPTION_KEY`, 32
 * bytes hex-encoded). Envelopes are versioned ASCII strings safe for a
 * text column: `v1:<base64url(iv || tag || ciphertext)>`.
 *
 * The core encrypt/decrypt functions are pure over an explicit key so they
 * stay unit-testable; `getSmtpEncryptionKey` binds the configured key.
 */

export class SmtpCryptoError extends Error {
  readonly code = "smtp_crypto_failed";
  constructor(message = "SMTP credential encryption or decryption failed.") {
    super(message);
    this.name = "SmtpCryptoError";
  }
}

const ENVELOPE_VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export function parseEncryptionKey(keyHex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new SmtpCryptoError(
      "MAILMAAN_SMTP_ENCRYPTION_KEY must be 32 bytes hex-encoded (64 hex characters).",
    );
  }
  return Buffer.from(keyHex, "hex");
}

/** Reads and validates the configured key; throws an actionable error when missing. */
export function getSmtpEncryptionKey(): Buffer {
  const keyHex = getServerEnv().MAILMAAN_SMTP_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new SmtpCryptoError(
      "MAILMAAN_SMTP_ENCRYPTION_KEY is not configured. Generate one with `openssl rand -hex 32` and set it in .env.local (server-only, never commit).",
    );
  }
  return parseEncryptionKey(keyHex);
}

/** Encrypts one SMTP secret (e.g. password) into a versioned envelope. */
export function encryptSmtpSecret(plaintext: string, key: Buffer): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new SmtpCryptoError("Cannot encrypt an empty SMTP secret.");
  }
  if (key.length !== KEY_BYTES) {
    throw new SmtpCryptoError("SMTP encryption key must be 32 bytes.");
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENVELOPE_VERSION}:${Buffer.concat([iv, tag, ciphertext]).toString("base64url")}`;
}

/** Decrypts an envelope; throws SmtpCryptoError on any tampering or wrong key. */
export function decryptSmtpSecret(envelope: string, key: Buffer): string {
  if (key.length !== KEY_BYTES) {
    throw new SmtpCryptoError("SMTP encryption key must be 32 bytes.");
  }
  const prefix = `${ENVELOPE_VERSION}:`;
  if (typeof envelope !== "string" || !envelope.startsWith(prefix)) {
    throw new SmtpCryptoError("Unrecognized SMTP credential envelope.");
  }
  let raw: Buffer;
  try {
    raw = Buffer.from(envelope.slice(prefix.length), "base64url");
  } catch {
    throw new SmtpCryptoError("SMTP credential envelope is corrupted.");
  }
  if (raw.length <= IV_BYTES + TAG_BYTES) {
    throw new SmtpCryptoError("SMTP credential envelope is corrupted.");
  }
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new SmtpCryptoError("SMTP credential decryption failed (wrong key or tampered data).");
  }
}

/** Masked username for dashboard display and logs; never log the password. */
export function maskSmtpUser(user: string): string {
  if (user.includes("@")) {
    const [local, domain] = user.split("@");
    const head = local.slice(0, 2);
    return `${head}***@${domain}`;
  }
  return `${user.slice(0, 2)}***`;
}
