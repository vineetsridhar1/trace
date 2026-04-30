import { describe, expect, it } from "vitest";
import {
  RuntimeAdapterRegistry,
  type RuntimeAdapter,
  type RuntimeAdapterType,
} from "./runtime-adapter-registry.js";

function makeAdapter(type: RuntimeAdapterType): RuntimeAdapter {
  return {
    type,
    async validateConfig() {},
    async testConfig() {
      return { ok: true };
    },
    async startSession() {
      return { status: "selected" };
    },
    async stopSession() {
      return { ok: true, status: "stopped" };
    },
    async getStatus() {
      return { status: "unknown" };
    },
  };
}

describe("RuntimeAdapterRegistry", () => {
  it("looks up local and provisioned adapters", () => {
    const local = makeAdapter("local");
    const provisioned = makeAdapter("provisioned");
    const registry = new RuntimeAdapterRegistry([local, provisioned]);

    expect(registry.get("local")).toBe(local);
    expect(registry.get("provisioned")).toBe(provisioned);
  });

  it("fails clearly for unsupported adapter types", () => {
    const registry = new RuntimeAdapterRegistry([makeAdapter("local")]);

    expect(() => registry.get("aws")).toThrow("Unsupported runtime adapter: aws");
    expect(() => registry.get("provisioned")).toThrow("Unsupported runtime adapter: provisioned");
  });
});
