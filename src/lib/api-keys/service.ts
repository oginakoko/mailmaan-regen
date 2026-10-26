import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "../env";
import { createSupabaseServiceClient } from "../supabase/service";

/**
 * ApiKeyService (Blueprint §4C, §6).
 *
 * Key format: `mk_live_<base64url secret>`. Only the SHA-256 hash of the
 * secret and a short identification prefix are persisted — the raw key is
 * shown once at creation and can never be recovered. Verification derives
 * the project from the stored record; a client-supplied project_id is never
 * trusted (Blueprint §6).
 */

export const API_KEY_PREFIX = "mk_live_";
const SECRET_BYTES = 32;

export type ApiKeyScope = "read" | "send" | "events";
export const API_KEY_SCOPES: readonly ApiKeyScope[] = ["read", "send", "events"];

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export interface GeneratedApiKey {
  rawKey: string;
  prefix: string;
  keyHash: string;
}

/** Pure generator (unit-testable). The raw key must be shown once, never stored. */
export function generateApiKeySecret(): GeneratedApiKey {
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  const rawKey = `${API_KEY_PREFIX}${secret}`;
  return {
    rawKey,
    prefix: rawKey.slice(0, API_KEY_PREFIX.length + 8),
    keyHash: sha256Hex(rawKey),
  };
}

/** Constant-time hash comparison to avoid timing oracles on lookup. */
export function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface ApiKeyRecord {
  id: string;
  project_id: string;
  name: string | null;
  prefix: string;
  scopes: string[];
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface AuthenticatedApiKey {
  key: ApiKeyRecord;
  project: { id: string; name: string; slug: string; status: string };
}

export class ApiKeyAuthError extends Error {
  readonly code = "invalid_api_key";
  constructor(message = "API key is missing, invalid, revoked, or expired.") {
    super(message);
    this.name = "ApiKeyAuthError";
  }
}

/**
 * Authenticate a raw Mailmaan API key. Returns the stored record + owning
 * project, or throws ApiKeyAuthError. Updates last_used_at best-effort.
 */
export async function authenticateApiKey(rawKey: string | null): Promise<AuthenticatedApiKey> {
  if (!rawKey || !rawKey.startsWith(API_KEY_PREFIX)) {
    throw new ApiKeyAuthError();
  }
  const service = createSupabaseServiceClient();
  const keyHash = sha256Hex(rawKey);

  const { data, error } = await service
    .from("api_keys")
    .select("id, project_id, name, prefix, key_hash, scopes, revoked_at, expires_at, last_used_at, created_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error || !data) throw new ApiKeyAuthError();
  if (!hashesEqual(data.key_hash, keyHash)) throw new ApiKeyAuthError();
  if (data.revoked_at) throw new ApiKeyAuthError("API key has been revoked.");
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    throw new ApiKeyAuthError("API key has expired.");
  }

  const { data: project, error: projectError } = await service
    .from("projects")
    .select("id, name, slug, status")
    .eq("id", data.project_id)
    .maybeSingle();
  if (projectError || !project) throw new ApiKeyAuthError();

  // Best-effort usage stamp; never block auth on it.
  void service
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => undefined);

  return {
    key: {
      id: data.id,
      project_id: data.project_id,
      name: data.name,
      prefix: data.prefix,
      scopes: data.scopes ?? [],
      revoked_at: data.revoked_at,
      last_used_at: data.last_used_at,
      created_at: data.created_at,
    },
    project,
  };
}

/**
 * Scope guard (convenience wrapper). Blueprints scopes: read < send/events
 * (send implies read). Throws ApiKeyAuthError when the scope is missing.
 */
export function requireScope(auth: AuthenticatedApiKey, scope: ApiKeyScope): void {
  assertScope(auth, scope);
}

/** Scope guard. Throws ApiKeyAuthError when the key lacks the scope. */
export function assertScope(auth: AuthenticatedApiKey, scope: ApiKeyScope): void {
  const scopes = new Set(auth.key.scopes);
  if (scopes.has(scope)) return;
  if (scope === "read" && (scopes.has("send") || scopes.has("events"))) return;
  throw new ApiKeyAuthError(`API key is missing the '${scope}' scope.`);
}

/**
 * Create a key for a project. Caller (dashboard route) must already have
 * verified project ownership via the user's session + RLS. Returns the raw
 * key exactly once; only its hash is stored.
 */
export async function createApiKey(input: {
  projectId: string;
  name?: string;
  scopes: ApiKeyScope[];
}): Promise<{ record: ApiKeyRecord; rawKey: string }> {
  const scopes = [...new Set(input.scopes)];
  if (scopes.length === 0) throw new Error("At least one scope is required.");
  for (const scope of scopes) {
    if (!API_KEY_SCOPES.includes(scope)) throw new Error(`Unknown scope: ${scope}`);
  }
  const generated = generateApiKeySecret();
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("api_keys")
    .insert({
      project_id: input.projectId,
      name: input.name ?? null,
      prefix: generated.prefix,
      key_hash: generated.keyHash,
      scopes,
    })
    .select("id, project_id, name, prefix, scopes, revoked_at, last_used_at, created_at")
    .single();
  if (error || !data) throw new Error(`Failed to create API key: ${error?.message ?? "unknown error"}`);
  return { record: data as ApiKeyRecord, rawKey: generated.rawKey };
}

/** Revoke a key (idempotent). Caller must have verified project ownership. */
export async function revokeApiKey(input: { projectId: string; keyId: string }): Promise<void> {
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", input.keyId)
    .eq("project_id", input.projectId)
    .is("revoked_at", null);
  if (error) throw new Error(`Failed to revoke API key: ${error.message}`);
}

/** Safe list for the dashboard: never selects key_hash. */
export async function listApiKeys(projectId: string): Promise<ApiKeyRecord[]> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("api_keys")
    .select("id, project_id, name, prefix, scopes, revoked_at, last_used_at, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to list API keys: ${error.message}`);
  return (data ?? []) as ApiKeyRecord[];
}

export function getApiKeyEnvHint(): string {
  // Referenced so tree-shaken server modules keep env wiring explicit.
  return getServerEnv().NEXT_PUBLIC_APP_URL ?? "";
}
