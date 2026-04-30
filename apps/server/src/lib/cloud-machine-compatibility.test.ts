import { describe, expect, it } from "vitest";
import { createLegacyCloudMachineCompatibilityService } from "./cloud-machine-compatibility.js";
import { CloudMachineService } from "./cloud-machine-service.js";

describe("createLegacyCloudMachineCompatibilityService", () => {
  it("is disabled in local mode", () => {
    expect(createLegacyCloudMachineCompatibilityService({ localMode: true })).toBeNull();
  });

  it("creates only the legacy cloud-machine compatibility service outside local mode", () => {
    expect(createLegacyCloudMachineCompatibilityService({ localMode: false })).toBeInstanceOf(
      CloudMachineService,
    );
  });
});
