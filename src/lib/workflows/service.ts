import "server-only";
import { z } from "zod";
import { EmailSendError, queueEmailSend, type DeliveryProvider } from "../email/send";
import { createSupabaseServiceClient } from "../supabase/service";
import { TemplateService } from "../templates/service";
import {
  evaluateConditions,
  getJsonPath,
  resolveVariables,
  validateJsonPath,
  variableMappingsSchema,
  workflowConditionsSchema,
  type VariableMappings,
  type WorkflowConditions,
  type WorkflowEventRoot,
} from "./paths";

/**
 * Workflow engine (Blueprint §11 MVP, Day 6).
 *
 * No background worker exists in this architecture (ADR-0002), so execution
 * is synchronous: ingest persists the event, matches enabled workflows, and
 * executes due runs inline. Delayed runs stay `queued` until the
 * reconciler (`reconcileProject`) executes them past their due time; the
 * same reconciler replays events left `pending` by an interrupted ingest.
 * One run per (workflow, event) is enforced by unique constraint, and every
 * run sends with the stable idempotency key `wf:<run_id>`, so retries and
 * reconciliations never double-send.
 */

export class WorkflowError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "WorkflowError";
    this.code = code;
    this.status = status;
  }
}

export const MAX_EVENT_DATA_BYTES = 64_000;
export const MAX_MATCHED_WORKFLOWS = 10;

export const eventNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_.-]+$/, "event name may contain letters, numbers, dot, dash, underscore");

const workflowInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  trigger_event: eventNameSchema,
  conditions: z.unknown().default({}),
  template_id: z.string().uuid("template_id must be a template UUID"),
  recipient_path: z.string().trim().min(1).max(200).default("data.email"),
  variable_mappings: z.unknown().default({}),
  delay_seconds: z.number().int().min(0).max(86400).default(0),
  enabled: z.boolean().default(false),
});
export type WorkflowInput = z.infer<typeof workflowInputSchema>;

export interface WorkflowRecord {
  id: string;
  project_id: string;
  name: string;
  trigger_event: string;
  conditions: WorkflowConditions;
  template_id: string | null;
  recipient_path: string;
  variable_mappings: VariableMappings;
  delay_seconds: number;
  enabled: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRunSummary {
  id: string;
  workflow_id: string;
  app_event_id: string;
  status: string;
  message_id: string | null;
  error_code: string | null;
  error_message: string | null;
}

export interface IngestedEvent {
  id: string;
  name: string;
  dispatch_status: string;
  replayed: boolean;
  runs: WorkflowRunSummary[];
}

function toRecord(row: Record<string, unknown>): WorkflowRecord {
  const conditions = workflowConditionsSchema
    .safeParse((row.conditions as Record<string, unknown> | null) ?? {});
  const mappings = variableMappingsSchema.safeParse(
    (row.variable_mappings as Record<string, unknown> | null) ?? {},
  );
  return {
    ...(row as unknown as WorkflowRecord),
    conditions: conditions.success ? conditions.data : { all: [] },
    variable_mappings: mappings.success ? mappings.data : {},
  };
}

function toRunSummary(row: Record<string, unknown>): WorkflowRunSummary {
  return {
    id: String(row.id),
    workflow_id: String(row.workflow_id),
    app_event_id: String(row.app_event_id),
    status: String(row.status),
    message_id: (row.message_id as string | null) ?? null,
    error_code: (row.error_code as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
  };
}

function parseWorkflowInput(raw: unknown): Omit<WorkflowInput, "conditions" | "variable_mappings"> & {
  conditions: WorkflowConditions;
  variable_mappings: VariableMappings;
} {
  const parsed = workflowInputSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new WorkflowError("workflow_invalid", `${first.path.join(".")}: ${first.message}`, 422);
  }
  const conditions = workflowConditionsSchema.safeParse(parsed.data.conditions);
  if (!conditions.success) {
    throw new WorkflowError("workflow_invalid", `conditions: ${conditions.error.issues[0].message}`, 422);
  }
  const mappings = variableMappingsSchema.safeParse(parsed.data.variable_mappings);
  if (!mappings.success) {
    throw new WorkflowError(
      "workflow_invalid",
      `variable_mappings: ${mappings.error.issues[0].message}`,
      422,
    );
  }
  const pathIssues = validateJsonPath(parsed.data.recipient_path);
  if (pathIssues.length > 0) {
    throw new WorkflowError("workflow_invalid", `recipient_path: ${pathIssues[0]}`, 422);
  }
  return { ...parsed.data, conditions: conditions.data, variable_mappings: mappings.data };
}

export async function listWorkflows(projectId: string): Promise<WorkflowRecord[]> {
  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from("workflows")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to list workflows: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(toRecord);
}

export async function getWorkflow(projectId: string, workflowId: string): Promise<WorkflowRecord | null> {
  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load workflow: ${error.message}`);
  return data ? toRecord(data as Record<string, unknown>) : null;
}

async function assertTemplateInProject(projectId: string, templateId: string): Promise<void> {
  const template = await new TemplateService().getTemplate(projectId, templateId);
  if (!template) {
    throw new WorkflowError("workflow_invalid", "Template does not exist in this project.", 422);
  }
}

/** Dashboard CRUD: caller must have verified project ownership. */
export async function createWorkflow(projectId: string, raw: unknown): Promise<WorkflowRecord> {
  const input = parseWorkflowInput(raw);
  await assertTemplateInProject(projectId, input.template_id);
  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from("workflows")
    .insert({
      project_id: projectId,
      name: input.name,
      trigger_event: input.trigger_event,
      conditions: input.conditions,
      template_id: input.template_id,
      recipient_path: input.recipient_path,
      variable_mappings: input.variable_mappings,
      delay_seconds: input.delay_seconds,
      enabled: input.enabled,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to create workflow: ${error?.message ?? "unknown error"}`);
  return toRecord(data as Record<string, unknown>);
}

/** Dashboard CRUD: material edits bump `version` for the audit trail. */
export async function updateWorkflow(
  projectId: string,
  workflowId: string,
  raw: unknown,
): Promise<WorkflowRecord> {
  const input = parseWorkflowInput(raw);
  await assertTemplateInProject(projectId, input.template_id);
  const db = createSupabaseServiceClient();
  const { data: existing, error: loadError } = await db
    .from("workflows")
    .select("version")
    .eq("id", workflowId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (loadError) throw new Error(`Failed to load workflow: ${loadError.message}`);
  if (!existing) throw new WorkflowError("workflow_not_found", "Workflow not found.", 404);
  const { data, error } = await db
    .from("workflows")
    .update({
      name: input.name,
      trigger_event: input.trigger_event,
      conditions: input.conditions,
      template_id: input.template_id,
      recipient_path: input.recipient_path,
      variable_mappings: input.variable_mappings,
      delay_seconds: input.delay_seconds,
      enabled: input.enabled,
      version: Number(existing.version ?? 1) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workflowId)
    .eq("project_id", projectId)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to update workflow: ${error?.message ?? "unknown error"}`);
  return toRecord(data as Record<string, unknown>);
}

/** Dashboard CRUD: runs cascade-delete with the workflow. */
export async function deleteWorkflow(projectId: string, workflowId: string): Promise<void> {
  const db = createSupabaseServiceClient();
  const { error } = await db.from("workflows").delete().eq("id", workflowId).eq("project_id", projectId);
  if (error) throw new Error(`Failed to delete workflow: ${error.message}`);
}

async function failRun(
  db: ReturnType<typeof createSupabaseServiceClient>,
  runId: string,
  code: string,
  message: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .from("workflow_runs")
    .update({ status: "failed", error_code: code, error_message: message, completed_at: now })
    .eq("id", runId);
}

/**
 * Executes one run to a terminal state. Idempotent per run: the send uses
 * the stable key `wf:<run_id>`, and only the worker that flips
 * queued → running proceeds.
 */
export async function executeRun(
  projectId: string,
  runId: string,
  deps?: { provider?: DeliveryProvider; requestId?: string },
): Promise<WorkflowRunSummary> {
  const db = createSupabaseServiceClient();
  const { data: run, error: runError } = await db
    .from("workflow_runs")
    .select("*")
    .eq("id", runId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (runError) throw new Error(`Failed to load run: ${runError.message}`);
  if (!run) throw new WorkflowError("run_not_found", "Workflow run not found.", 404);
  if (run.status !== "queued") return toRunSummary(run as Record<string, unknown>);

  const { data: claimed, error: claimError } = await db
    .from("workflow_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (claimError) throw new Error(`Failed to claim run: ${claimError.message}`);
  if (!claimed) {
    const { data: raced } = await db.from("workflow_runs").select("*").eq("id", runId).single();
    return toRunSummary(raced as Record<string, unknown>);
  }

  const failedSummary = (code: string, message: string): WorkflowRunSummary => ({
    ...toRunSummary(claimed as Record<string, unknown>),
    status: "failed",
    error_code: code,
    error_message: message,
  });
  const workflow = await getWorkflow(projectId, String(run.workflow_id));
  if (!workflow) {
    await failRun(db, runId, "workflow_deleted", "Workflow no longer exists.");
    return failedSummary("workflow_deleted", "Workflow no longer exists.");
  }
  const { data: appEvent } = await db
    .from("app_events")
    .select("id, event_name, payload")
    .eq("id", String(run.app_event_id))
    .maybeSingle();
  if (!appEvent) {
    await failRun(db, runId, "event_deleted", "Triggering event no longer exists.");
    return failedSummary("event_deleted", "Triggering event no longer exists.");
  }
  const root: WorkflowEventRoot = {
    id: String(appEvent.id),
    name: String(appEvent.event_name),
    data: ((appEvent.payload as Record<string, unknown> | null)?.data ?? {}) as Record<string, unknown>,
  };

  const mismatches = evaluateConditions(workflow.conditions, root);
  if (mismatches.length > 0) {
    const now = new Date().toISOString();
    const errorMessage = mismatches.join("; ");
    await db
      .from("workflow_runs")
      .update({
        status: "skipped",
        error_code: "conditions_mismatch",
        error_message: errorMessage,
        completed_at: now,
      })
      .eq("id", runId);
    return {
      ...toRunSummary(claimed as Record<string, unknown>),
      status: "skipped",
      error_code: "conditions_mismatch",
      error_message: errorMessage,
    };
  }

  const templateService = new TemplateService(db);
  const template = workflow.template_id
    ? await templateService.getTemplate(projectId, workflow.template_id)
    : null;
  if (!template || template.status !== "published") {
    await failRun(db, runId, "template_unpublished", "Workflow template is not published.");
    return failedSummary("template_unpublished", "Workflow template is not published.");
  }

  const recipient = getJsonPath(root, workflow.recipient_path);
  if (typeof recipient !== "string" || !recipient.trim()) {
    const message = `Recipient path ${workflow.recipient_path} did not resolve to an address.`;
    await failRun(db, runId, "recipient_unresolvable", message);
    return failedSummary("recipient_unresolvable", message);
  }
  const { values, issues } = resolveVariables(workflow.variable_mappings, root);
  if (issues.length > 0) {
    await failRun(db, runId, "variables_unresolvable", issues.join("; "));
    return failedSummary("variables_unresolvable", issues.join("; "));
  }

  try {
    const sent = await queueEmailSend(
      {
        projectId,
        to: recipient,
        template: template.slug,
        variables: values,
        metadata: { workflow_id: workflow.id, run_id: runId, app_event_id: root.id },
        idempotencyKey: `wf:${runId}`,
        ...(deps?.requestId ? { requestId: deps.requestId } : {}),
      },
      deps?.provider ? { provider: deps.provider } : undefined,
    );
    const now = new Date().toISOString();
    await db
      .from("workflow_runs")
      .update({ status: "completed", message_id: sent.id, completed_at: now })
      .eq("id", runId);
    return { ...toRunSummary(claimed as Record<string, unknown>), status: "completed", message_id: sent.id };
  } catch (error) {
    if (error instanceof EmailSendError) {
      await failRun(db, runId, error.code, error.message);
      return failedSummary(error.code, error.message);
    }
    const message = error instanceof Error ? error.message : "Run failed.";
    await failRun(db, runId, "run_failed", message);
    return failedSummary("run_failed", message);
  }
}

async function matchAndRun(
  db: ReturnType<typeof createSupabaseServiceClient>,
  projectId: string,
  appEventId: string,
  eventName: string,
  deps?: { provider?: DeliveryProvider; requestId?: string },
): Promise<WorkflowRunSummary[]> {
  const { data: workflows, error } = await db
    .from("workflows")
    .select("*")
    .eq("project_id", projectId)
    .eq("trigger_event", eventName)
    .eq("enabled", true)
    .order("created_at", { ascending: true })
    .limit(MAX_MATCHED_WORKFLOWS + 1);
  if (error) throw new Error(`Workflow matching failed: ${error.message}`);
  if ((workflows ?? []).length > MAX_MATCHED_WORKFLOWS) {
    throw new WorkflowError(
      "too_many_workflows",
      `More than ${MAX_MATCHED_WORKFLOWS} enabled workflows match ${eventName}.`,
      422,
    );
  }
  const runs: WorkflowRunSummary[] = [];
  for (const row of workflows ?? []) {
    const workflow = toRecord(row as Record<string, unknown>);
    const { data: created, error: createError } = await db
      .from("workflow_runs")
      .insert({ project_id: projectId, workflow_id: workflow.id, app_event_id: appEventId })
      .select("*")
      .single();
    if (createError) {
      if (createError.code !== "23505") throw new Error(`Run creation failed: ${createError.message}`);
      const { data: raced } = await db
        .from("workflow_runs")
        .select("*")
        .eq("workflow_id", workflow.id)
        .eq("app_event_id", appEventId)
        .single();
      if (!raced) throw new Error("Run creation raced and vanished.");
      runs.push(toRunSummary(raced as Record<string, unknown>));
      continue;
    }
    const runId = String((created as Record<string, unknown>).id);
    if (workflow.delay_seconds > 0) {
      runs.push(toRunSummary(created as Record<string, unknown>));
      continue;
    }
    runs.push(await executeRun(projectId, runId, deps));
  }
  return runs;
}

/**
 * Ingests one app event: persists first, then matches and executes inline.
 * External ids replay idempotently (no re-trigger). Delayed runs stay
 * queued for the reconciler.
 */
export async function ingestEvent(
  projectId: string,
  raw: { externalId?: string; name: string; data: unknown },
  deps?: { provider?: DeliveryProvider; requestId?: string },
): Promise<IngestedEvent> {
  const name = eventNameSchema.safeParse(raw.name);
  if (!name.success) {
    throw new WorkflowError("event_invalid", `name: ${name.error.issues[0].message}`, 422);
  }
  if (typeof raw.data !== "object" || raw.data === null || Array.isArray(raw.data)) {
    throw new WorkflowError("event_invalid", "data must be an object.", 422);
  }
  const payload = { data: raw.data };
  if (JSON.stringify(payload).length > MAX_EVENT_DATA_BYTES) {
    throw new WorkflowError("event_too_large", `Event payload exceeds ${MAX_EVENT_DATA_BYTES} bytes.`, 413);
  }
  const db = createSupabaseServiceClient();
  const externalId = raw.externalId?.trim() || null;

  if (externalId) {
    const { data: replayed } = await db
      .from("app_events")
      .select("id, event_name, dispatch_status")
      .eq("project_id", projectId)
      .eq("external_event_id", externalId)
      .maybeSingle();
    if (replayed) {
      const { data: runs } = await db
        .from("workflow_runs")
        .select("*")
        .eq("project_id", projectId)
        .eq("app_event_id", replayed.id);
      return {
        id: String(replayed.id),
        name: String(replayed.event_name),
        dispatch_status: String(replayed.dispatch_status),
        replayed: true,
        runs: ((runs ?? []) as Record<string, unknown>[]).map(toRunSummary),
      };
    }
  }

  const { data: created, error: createError } = await db
    .from("app_events")
    .insert({
      project_id: projectId,
      external_event_id: externalId,
      event_name: name.data,
      payload,
      dispatch_status: "pending",
      request_id: deps?.requestId ?? null,
    })
    .select("id, event_name")
    .single();
  if (createError || !created) {
    if (createError?.code === "23505" && externalId) {
      return ingestEvent(projectId, { externalId, name: name.data, data: raw.data }, deps);
    }
    throw new Error(`Event persistence failed: ${createError?.message ?? "unknown error"}`);
  }
  const eventId = String((created as Record<string, unknown>).id);

  try {
    const runs = await matchAndRun(db, projectId, eventId, name.data, {
      provider: deps?.provider,
      requestId: deps?.requestId,
    });
    await db
      .from("app_events")
      .update({ dispatch_status: "dispatched", dispatched_at: new Date().toISOString() })
      .eq("id", eventId);
    return { id: eventId, name: name.data, dispatch_status: "dispatched", replayed: false, runs };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Dispatch failed.";
    await db.from("app_events").update({ dispatch_status: "failed", last_error: detail }).eq("id", eventId);
    throw error;
  }
}

/**
 * Reconciler: replays events stuck `pending` (interrupted ingest) and
 * executes delayed runs past their due time. Safe to run repeatedly.
 */
export async function reconcileProject(
  projectId: string,
  deps?: { provider?: DeliveryProvider; now?: Date },
): Promise<{ events_reconciled: number; runs_executed: number }> {
  const db = createSupabaseServiceClient();
  const now = deps?.now ?? new Date();
  let eventsReconciled = 0;
  let runsExecuted = 0;

  const { data: pending } = await db
    .from("app_events")
    .select("id, event_name")
    .eq("project_id", projectId)
    .eq("dispatch_status", "pending")
    .order("received_at", { ascending: true })
    .limit(50);
  for (const row of pending ?? []) {
    const eventId = String(row.id);
    try {
      await matchAndRun(db, projectId, eventId, String(row.event_name), deps);
      await db
        .from("app_events")
        .update({ dispatch_status: "dispatched", dispatched_at: now.toISOString() })
        .eq("id", eventId);
      eventsReconciled += 1;
    } catch (error) {
      await db
        .from("app_events")
        .update({
          dispatch_status: "failed",
          last_error: error instanceof Error ? error.message : "Reconcile failed.",
        })
        .eq("id", eventId);
    }
  }

  const { data: due } = await db
    .from("workflow_runs")
    .select("id, created_at, workflow_id")
    .eq("project_id", projectId)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(50);
  for (const row of due ?? []) {
    const { data: workflow } = await db
      .from("workflows")
      .select("delay_seconds")
      .eq("id", String(row.workflow_id))
      .maybeSingle();
    const delaySeconds = Number(workflow?.delay_seconds ?? 0);
    const dueAt = new Date(String(row.created_at)).getTime() + delaySeconds * 1000;
    if (dueAt > now.getTime()) continue;
    await executeRun(projectId, String(row.id), deps);
    runsExecuted += 1;
  }
  return { events_reconciled: eventsReconciled, runs_executed: runsExecuted };
}
