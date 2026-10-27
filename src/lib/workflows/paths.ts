import { z } from "zod";

/**
 * Workflow path/condition/mapping evaluation (Blueprint §11 MVP).
 *
 * Pure, deterministic, no code execution: dot-separated JSON paths over the
 * event root `{id, name, data}`, `exists`/`equals` conditions, and
 * path-or-constant variable mappings. Anything else is rejected at save
 * time by the schemas below.
 */

export interface WorkflowEventRoot {
  id: string;
  name: string;
  data: Record<string, unknown>;
}

const PATH_SEGMENT = /^[A-Za-z0-9_]+$/;
const MAX_CONDITIONS = 10;
const MAX_MAPPINGS = 50;

/** Safe dot-path read. Returns undefined for anything unresolvable. */
export function getJsonPath(root: unknown, path: string): unknown {
  const segments = path.split(".");
  let current: unknown = root;
  for (const segment of segments) {
    if (!PATH_SEGMENT.test(segment)) return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
    } else if (typeof current === "object" && current !== null) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
    if (current === undefined) return undefined;
  }
  return current;
}

export function validateJsonPath(path: string, roots: readonly string[] = ["id", "name", "data"]): string[] {
  if (typeof path !== "string" || !path.trim()) return ["path must be a non-empty string"];
  const segments = path.trim().split(".");
  if (!roots.includes(segments[0])) return [`path must start with one of: ${roots.join(", ")}`];
  if (segments.length > 12) return ["path is too deep (max 12 segments)"];
  if (segments.some((segment) => !PATH_SEGMENT.test(segment))) {
    return ["path segments must match [A-Za-z0-9_]+"];
  }
  return [];
}

const conditionSchema = z
  .object({
    path: z.string().min(1).max(200),
    exists: z.boolean().optional(),
    equals: z.unknown().optional(),
  })
  .superRefine((value, context) => {
    if (value.exists === undefined && value.equals === undefined) {
      context.addIssue({
        code: "custom",
        message: "condition needs `exists` or `equals`",
      });
    }
  });

export const workflowConditionsSchema = z.object({
  all: z.array(conditionSchema).max(MAX_CONDITIONS).default([]),
});
export type WorkflowConditions = z.infer<typeof workflowConditionsSchema>;

function valuesEqual(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (typeof actual !== typeof expected) return false;
  if (typeof actual === "object" && actual !== null && expected !== null) {
    try {
      return JSON.stringify(actual) === JSON.stringify(expected);
    } catch {
      return false;
    }
  }
  return false;
}

/** Returns mismatch descriptions; empty means the conditions match. */
export function evaluateConditions(conditions: WorkflowConditions, event: WorkflowEventRoot): string[] {
  const mismatches: string[] = [];
  conditions.all.forEach((condition, index) => {
    const pathIssues = validateJsonPath(condition.path);
    if (pathIssues.length > 0) {
      mismatches.push(`condition ${index}: ${pathIssues[0]}`);
      return;
    }
    const actual = getJsonPath(event, condition.path);
    if (condition.exists !== undefined) {
      const exists = actual !== undefined && actual !== null;
      if (exists !== condition.exists) {
        mismatches.push(
          condition.exists
            ? `condition ${index}: expected ${condition.path} to exist`
            : `condition ${index}: expected ${condition.path} to be absent`,
        );
      }
    }
    if (condition.equals !== undefined && !valuesEqual(actual, condition.equals)) {
      mismatches.push(`condition ${index}: expected ${condition.path} to equal the configured value`);
    }
  });
  return mismatches;
}

const variableMappingSchema = z.union([
  z.object({ path: z.string().min(1).max(200) }).strict(),
  z.object({ const: z.union([z.string(), z.number(), z.boolean()]) }).strict(),
]);

export const variableMappingsSchema = z
  .record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, "variable name must start with a letter"), variableMappingSchema)
  .refine((mappings) => Object.keys(mappings).length <= MAX_MAPPINGS, {
    message: `at most ${MAX_MAPPINGS} variable mappings`,
  });
export type VariableMappings = z.infer<typeof variableMappingsSchema>;

/** Resolves mapped values; collects unresolvable paths as issues. */
export function resolveVariables(
  mappings: VariableMappings,
  event: WorkflowEventRoot,
): { values: Record<string, unknown>; issues: string[] } {
  const values: Record<string, unknown> = {};
  const issues: string[] = [];
  for (const [name, mapping] of Object.entries(mappings)) {
    if ("const" in mapping) {
      values[name] = mapping.const;
      continue;
    }
    const pathIssues = validateJsonPath(mapping.path);
    if (pathIssues.length > 0) {
      issues.push(`variable ${name}: ${pathIssues[0]}`);
      continue;
    }
    const value = getJsonPath(event, mapping.path);
    if (value === undefined || value === null) {
      issues.push(`variable ${name}: ${mapping.path} is missing from the event`);
      continue;
    }
    values[name] = value;
  }
  return { values, issues };
}
