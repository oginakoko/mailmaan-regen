import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createSupabaseServiceClient } from "../../src/lib/supabase/service";
import {
  deleteSmtpConfig,
  getSmtpConfigSummary,
  getSmtpCredentialsForSend,
  SmtpConfigError,
  SmtpNotConfiguredError,
  upsertSmtpConfig,
} from "../../src/lib/smtp/service";

/**
 * Durable integration coverage for the SMTP config service (Day 4).
 *
 * Runs against the REAL Supabase test project using the service-role client.
 * Credentials are read manually from `.env.local` (never committed, values
 * never printed). When the service key or the SMTP encryption key is absent
 * the suite is skipped — there is no fake-green path. A throwaway probe
 * project is created per run and deleted afterwards (cascade removes the
 * SMTP row), so reruns stay clean.
 */

function loadEnvLocal(): Record<string, string> {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env.local");
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return {};
  }
  const parsed: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) parsed[key] = value;
  }
  return parsed;
}

const envLocal = loadEnvLocal();
for (const [key, value] of Object.entries(envLocal)) {
  process.env[key] = value;
}

const hasKeys = Boolean(
  envLocal.SUPABASE_SERVICE_ROLE_KEY &&
    envLocal.NEXT_PUBLIC_SUPABASE_URL &&
    envLocal.MAILMAAN_SMTP_ENCRYPTION_KEY,
);

describe.skipIf(!hasKeys)("smtp config service (integration)", () => {
  // Nine sequential Supabase round-trips; needs headroom beyond the 5s default.
  it("round-trips a masked config and decrypts only on the send path", async () => {
    const service = createSupabaseServiceClient();
    const slug = `smtp-probe-${Date.now()}`;
    const { data: project, error: projectError } = await service
      .from("projects")
      .insert({ name: "SMTP probe", slug, status: "active" })
      .select("id")
      .single();
    if (projectError || !project) throw new Error("probe project setup failed");
    try {
      expect(await getSmtpConfigSummary(project.id)).toBeNull();
      await expect(getSmtpCredentialsForSend(project.id)).rejects.toBeInstanceOf(
        SmtpNotConfiguredError,
      );
      await expect(
        upsertSmtpConfig(project.id, {
          host: "smtp.example.com",
          port: "587",
          secure: false,
          user: "sender@example.com",
          pass: "",
          from_email: "sender@example.com",
          from_name: "",
        }),
      ).rejects.toBeInstanceOf(SmtpConfigError);

      const saved = await upsertSmtpConfig(project.id, {
        host: "smtp.example.com",
        port: "587",
        secure: false,
        user: "sender@example.com",
        pass: "probe-secret-pass",
        from_email: "sender@example.com",
        from_name: "Probe Sender",
      });
      expect(saved.host).toBe("smtp.example.com");
      expect(saved.port).toBe(587);
      expect(saved.user_masked).toBe("se***@example.com");
      expect(saved).not.toHaveProperty("smtp_pass_encrypted");
      expect(saved).not.toHaveProperty("pass");

      // Blank password keeps the stored secret on update.
      const kept = await upsertSmtpConfig(project.id, {
        host: "smtp.example.com",
        port: "587",
        secure: false,
        user: "sender@example.com",
        pass: "",
        from_email: "sender@example.com",
        from_name: "Probe Sender",
      });
      expect(kept.user_masked).toBe("se***@example.com");

      const creds = await getSmtpCredentialsForSend(project.id);
      expect(creds.pass).toBe("probe-secret-pass");
      expect(creds.from_email).toBe("sender@example.com");

      await deleteSmtpConfig(project.id);
      expect(await getSmtpConfigSummary(project.id)).toBeNull();
      await expect(getSmtpCredentialsForSend(project.id)).rejects.toBeInstanceOf(
        SmtpNotConfiguredError,
      );
    } finally {
      await service.from("projects").delete().eq("id", project.id);
    }
  }, 60_000);
});
