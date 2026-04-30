import { describe, expect, it } from "vitest";
import { isCloudMachineRuntimeId } from "@trace/shared";

describe("isCloudMachineRuntimeId", () => {
  it("recognizes legacy cloud machine runtime ids", () => {
    expect(isCloudMachineRuntimeId("cloud-machine-runtime-1")).toBe(true);
  });

  it("recognizes provisioned session adapter runtime ids", () => {
    expect(isCloudMachineRuntimeId("runtime_539aec84-e922-4971-8d72-5afbe5bd0e5a")).toBe(true);
  });

  it("does not classify local bridge runtime ids as cloud", () => {
    expect(isCloudMachineRuntimeId("61b53fef-0582-4e8b-b566-4475fadc12c1")).toBe(false);
  });
});
