import { describe, expect, it } from "vitest";
import { hasSelectedSessionGroupRuntime } from "../src/lib/session-group.js";

describe("hasSelectedSessionGroupRuntime", () => {
  it("recognizes local, provisioned, and ready workspace bindings", () => {
    expect(hasSelectedSessionGroupRuntime({ runtimeInstanceId: "runtime-1" }, null)).toBe(true);
    expect(hasSelectedSessionGroupRuntime({ environmentId: "environment-1" }, null)).toBe(true);
    expect(hasSelectedSessionGroupRuntime({ adapterType: "provisioned" }, null)).toBe(true);
    expect(hasSelectedSessionGroupRuntime(null, "/workspaces/bear-2")).toBe(true);
  });

  it("leaves a new unbound group eligible for its first bridge selection", () => {
    expect(hasSelectedSessionGroupRuntime(null, null)).toBe(false);
    expect(hasSelectedSessionGroupRuntime({}, null)).toBe(false);
    expect(hasSelectedSessionGroupRuntime({ adapterType: "local" }, null)).toBe(false);
  });
});
