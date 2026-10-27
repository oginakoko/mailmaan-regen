import { describe, expect, it } from "vitest";
import {
  evaluateConditions,
  getJsonPath,
  resolveVariables,
  validateJsonPath,
  variableMappingsSchema,
  workflowConditionsSchema,
  type WorkflowEventRoot,
} from "./paths";

const EVENT: WorkflowEventRoot = {
  id: "evt_1",
  name: "user.signed_up",
  data: { email: "asha@example.com", firstName: "Asha", plan: "pro", seats: 3, tags: ["a", "b"] },
};

describe("getJsonPath", () => {
  it("reads nested values and array indices", () => {
    expect(getJsonPath(EVENT, "data.email")).toBe("asha@example.com");
    expect(getJsonPath(EVENT, "data.seats")).toBe(3);
    expect(getJsonPath(EVENT, "data.tags.1")).toBe("b");
    expect(getJsonPath(EVENT, "name")).toBe("user.signed_up");
  });

  it("returns undefined for missing or hostile paths, never throws", () => {
    expect(getJsonPath(EVENT, "data.missing")).toBeUndefined();
    expect(getJsonPath(EVENT, "data.email.x")).toBeUndefined();
    expect(getJsonPath(EVENT, "data.tags.99")).toBeUndefined();
    expect(getJsonPath(EVENT, "data..email")).toBeUndefined();
    expect(getJsonPath(EVENT, "__proto__.x")).toBeUndefined();
    expect(getJsonPath(null, "data.email")).toBeUndefined();
  });
});

describe("validateJsonPath", () => {
  it("accepts rooted paths and rejects the rest", () => {
    expect(validateJsonPath("data.email")).toEqual([]);
    expect(validateJsonPath("")).not.toEqual([]);
    expect(validateJsonPath("event.email")).not.toEqual([]);
    expect(validateJsonPath("data.bad-segment!")).not.toEqual([]);
  });
});

describe("evaluateConditions", () => {
  it("matches exists and equals conditions", () => {
    const parsed = workflowConditionsSchema.parse({
      all: [
        { path: "data.email", exists: true },
        { path: "data.plan", equals: "pro" },
        { path: "data.seats", equals: 3 },
      ],
    });
    expect(evaluateConditions(parsed, EVENT)).toEqual([]);
  });

  it("reports every mismatch without throwing", () => {
    const parsed = workflowConditionsSchema.parse({
      all: [
        { path: "data.email", exists: false },
        { path: "data.plan", equals: "free" },
        { path: "bogus", exists: true },
      ],
    });
    expect(evaluateConditions(parsed, EVENT)).toHaveLength(3);
  });

  it("rejects empty conditions and oversized lists at save time", () => {
    expect(() => workflowConditionsSchema.parse({ all: [{ path: "data.x" }] })).toThrow();
    expect(() =>
      workflowConditionsSchema.parse({ all: Array.from({ length: 11 }, () => ({ path: "data.x", exists: true })) }),
    ).toThrow();
  });
});

describe("resolveVariables", () => {
  it("resolves paths and constants", () => {
    const mappings = variableMappingsSchema.parse({
      firstName: { path: "data.firstName" },
      productName: { const: "Soko" },
      seats: { path: "data.seats" },
    });
    expect(resolveVariables(mappings, EVENT)).toEqual({
      values: { firstName: "Asha", productName: "Soko", seats: 3 },
      issues: [],
    });
  });

  it("collects unresolvable paths as issues", () => {
    const mappings = variableMappingsSchema.parse({ nick: { path: "data.nick" } });
    const result = resolveVariables(mappings, EVENT);
    expect(result.values).toEqual({});
    expect(result.issues).toHaveLength(1);
  });

  it("rejects bad variable names and shapes at save time", () => {
    expect(() => variableMappingsSchema.parse({ "9bad": { const: "x" } })).toThrow();
    expect(() => variableMappingsSchema.parse({ ok: { bogus: 1 } })).toThrow();
  });
});
