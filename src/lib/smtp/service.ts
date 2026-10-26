import "server-only";
import { createSupabaseServiceClient } from "../supabase/service";
import {
  decryptSmtpSecret,
  encryptSmtpSecret,
  getSmtpEncryptionKey,
  maskSmtpUser,
} from "./encryption";

/**
 * SmtpConfigService (ADR-0002, Blueprint §6).
 *
 * One SMTP mailbox per project. Passwords are stored only as AES-256-GCM
 * envelopes and decrypted in memory on the send path. Dashboard callers
 * receive masked summaries — the password is never readable back. Callers
 * (dashboard actions) must already have verified project ownership via the
 * user's session + RLS; this module derives everything from projectId.
 */

export class SmtpConfigError extends Error {
  readonly code = "smtp_config_invalid";
  constructor(message: string) {
    super(message);
    this.name = "SmtpConfigError";
  }
}

export class SmtpNotConfiguredError extends Error {
  readonly code = "smtp_not_configured";
  constructor(
    message = "No SMTP mailbox is configured for this project. Add one in project settings before sending.",
  ) {
    super(message);
    this.name = "SmtpNotConfiguredError";
  }
}

export interface SmtpFormInput {
  host: string;
  port: string;
  secure: boolean;
  user: string;
  /** Blank keeps the stored password on update; required on first save. */
  pass: string;
  from_email: string;
  from_name: string;
}

export interface NormalizedSmtpInput {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from_email: string;
  from_name: string | null;
}

export interface SmtpConfigSummary {
  id: string;
  project_id: string;
  host: string;
  port: number;
  secure: boolean;
  user_masked: string;
  from_email: string;
  from_name: string | null;
  updated_at: string;
}

export interface SmtpSendCredentials extends NormalizedSmtpInput {
  pass: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pure validator for dashboard/API input. Throws SmtpConfigError. */
export function validateSmtpForm(input: SmtpFormInput): NormalizedSmtpInput {
  const host = input.host.trim();
  if (!host || /\s/.test(host)) {
    throw new SmtpConfigError("SMTP host is required (no spaces).");
  }
  const port = Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new SmtpConfigError("SMTP port must be a number between 1 and 65535.");
  }
  const user = input.user.trim();
  if (!user) {
    throw new SmtpConfigError("SMTP username is required.");
  }
  const from_email = input.from_email.trim();
  if (!EMAIL_PATTERN.test(from_email) || /[\r\n]/.test(from_email)) {
    throw new SmtpConfigError("From address must be a valid email address.");
  }
  const from_name = input.from_name.trim().replace(/["\r\n]/g, "");
  return {
    host,
    port,
    secure: input.secure,
    user,
    from_email,
    from_name: from_name || null,
  };
}

/** Masked summary for the dashboard; never selects the encrypted password. */
export async function getSmtpConfigSummary(projectId: string): Promise<SmtpConfigSummary | null> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("project_smtp_configs")
    .select("id, project_id, smtp_host, smtp_port, smtp_secure, smtp_user, from_email, from_name, updated_at")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load SMTP config: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    project_id: data.project_id,
    host: data.smtp_host,
    port: data.smtp_port,
    secure: data.smtp_secure,
    user_masked: maskSmtpUser(data.smtp_user),
    from_email: data.from_email,
    from_name: data.from_name,
    updated_at: data.updated_at,
  };
}

/**
 * Create or replace a project's SMTP config. A blank `pass` keeps the
 * stored password (update only); first save requires a password.
 */
export async function upsertSmtpConfig(
  projectId: string,
  input: SmtpFormInput,
): Promise<SmtpConfigSummary> {
  const normalized = validateSmtpForm(input);
  const service = createSupabaseServiceClient();
  const key = getSmtpEncryptionKey();

  let encrypted = input.pass ? encryptSmtpSecret(input.pass, key) : null;
  if (!encrypted) {
    const { data: existing, error: existingError } = await service
      .from("project_smtp_configs")
      .select("smtp_pass_encrypted")
      .eq("project_id", projectId)
      .maybeSingle();
    if (existingError) throw new Error(`Failed to load SMTP config: ${existingError.message}`);
    if (!existing) {
      throw new SmtpConfigError("SMTP password is required when saving a mailbox for the first time.");
    }
    encrypted = existing.smtp_pass_encrypted;
  }

  const { data, error } = await service
    .from("project_smtp_configs")
    .upsert(
      {
        project_id: projectId,
        smtp_host: normalized.host,
        smtp_port: normalized.port,
        smtp_secure: normalized.secure,
        smtp_user: normalized.user,
        smtp_pass_encrypted: encrypted,
        from_email: normalized.from_email,
        from_name: normalized.from_name,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    )
    .select("id, project_id, smtp_host, smtp_port, smtp_secure, smtp_user, from_email, from_name, updated_at")
    .single();
  if (error || !data) throw new Error(`Failed to save SMTP config: ${error?.message ?? "unknown error"}`);
  return {
    id: data.id,
    project_id: data.project_id,
    host: data.smtp_host,
    port: data.smtp_port,
    secure: data.smtp_secure,
    user_masked: maskSmtpUser(data.smtp_user),
    from_email: data.from_email,
    from_name: data.from_name,
    updated_at: data.updated_at,
  };
}

/** Delete a project's SMTP config (idempotent). Sends block until re-added. */
export async function deleteSmtpConfig(projectId: string): Promise<void> {
  const service = createSupabaseServiceClient();
  const { error } = await service.from("project_smtp_configs").delete().eq("project_id", projectId);
  if (error) throw new Error(`Failed to delete SMTP config: ${error.message}`);
}

/**
 * Decrypted credentials for the send pipeline only. Throws
 * SmtpNotConfiguredError when the project has no mailbox — the send path
 * must never fall back to a shared mailbox.
 */
export async function getSmtpCredentialsForSend(projectId: string): Promise<SmtpSendCredentials> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("project_smtp_configs")
    .select("smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass_encrypted, from_email, from_name")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load SMTP config: ${error.message}`);
  if (!data) throw new SmtpNotConfiguredError();
  return {
    host: data.smtp_host,
    port: Number(data.smtp_port),
    secure: Boolean(data.smtp_secure),
    user: data.smtp_user,
    pass: decryptSmtpSecret(data.smtp_pass_encrypted, getSmtpEncryptionKey()),
    from_email: data.from_email,
    from_name: data.from_name,
  };
}
