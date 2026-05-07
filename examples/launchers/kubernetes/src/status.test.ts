import { describe, expect, it } from "vitest";
import type { V1Job, V1Pod } from "@kubernetes/client-node";
import { mapKubernetesRuntimeStatus } from "./status.js";

function job(status: V1Job["status"] = {}): V1Job {
  return { metadata: { name: "trace-runtime-1" }, status };
}

function pod(phase: string): V1Pod {
  return { status: { phase } };
}

describe("mapKubernetesRuntimeStatus", () => {
  it("maps no pods to provisioning", () => {
    expect(mapKubernetesRuntimeStatus(job(), [])).toMatchObject({ status: "provisioning" });
  });

  it("maps pending pods to booting", () => {
    expect(mapKubernetesRuntimeStatus(job({ active: 1 }), [pod("Pending")])).toMatchObject({
      status: "booting",
    });
  });

  it("maps running pods to connected", () => {
    expect(mapKubernetesRuntimeStatus(job({ active: 1 }), [pod("Running")])).toMatchObject({
      status: "connected",
    });
  });

  it("maps completed and failed jobs before pod phase", () => {
    expect(mapKubernetesRuntimeStatus(job({ succeeded: 1 }), [pod("Running")])).toMatchObject({
      status: "stopped",
    });
    expect(mapKubernetesRuntimeStatus(job({ failed: 1 }), [pod("Running")])).toMatchObject({
      status: "failed",
    });
  });
});
