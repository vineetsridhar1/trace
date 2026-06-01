import { describe, expect, it } from "vitest";
import { isProvisionedRuntimeId } from "@trace/shared";

describe("isProvisionedRuntimeId", () => {
  it("recognizes provisioned session adapter runtime ids", () => {
    expect(isProvisionedRuntimeId("runtime_539aec84-e922-4971-8d72-5afbe5bd0e5a")).toBe(true);
  });

  it("does not classify local bridge runtime ids as cloud", () => {
    expect(isProvisionedRuntimeId("61b53fef-0582-4e8b-b566-4475fadc12c1")).toBe(false);
  });

  it("does not recognize legacy runtime ids", () => {
    expect(isProvisionedRuntimeId("legacy-runtime-1")).toBe(false);
  });
});
