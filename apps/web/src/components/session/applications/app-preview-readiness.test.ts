import { describe, expect, it } from "vitest";
import {
  findReadyPreviewEndpoint,
  isLivePreviewRuntimeAvailable,
} from "./app-preview-readiness";

const endpoint = {
  id: "endpoint-1",
  sessionGroupId: "group-1",
  appConfigId: "app",
  processConfigId: "dev",
  status: "enabled",
  url: "https://preview.test",
};

describe("findReadyPreviewEndpoint", () => {
  it("keeps the skeleton visible while the app process is starting", () => {
    expect(
      findReadyPreviewEndpoint({
        sessionGroupId: "group-1",
        endpoints: [endpoint],
        processes: [{ ...endpoint, status: "starting" }],
      }),
    ).toBeUndefined();
  });

  it("returns the endpoint once its app process is running", () => {
    expect(
      findReadyPreviewEndpoint({
        sessionGroupId: "group-1",
        endpoints: [endpoint],
        processes: [{ ...endpoint, status: "running" }],
      }),
    ).toBe(endpoint);
  });

  it("does not match a running process from another app", () => {
    expect(
      findReadyPreviewEndpoint({
        sessionGroupId: "group-1",
        endpoints: [endpoint],
        processes: [{ ...endpoint, processConfigId: "worker", status: "running" }],
      }),
    ).toBeUndefined();
  });

  it("ignores a running process left behind by a replaced runtime", () => {
    expect(
      findReadyPreviewEndpoint({
        sessionGroupId: "group-1",
        endpoints: [endpoint],
        processes: [{ ...endpoint, status: "running", runtimeInstanceId: "runtime-old" }],
        activeRuntimeInstanceId: "runtime-new",
      }),
    ).toBeUndefined();
  });

  it("returns the endpoint when the process belongs to the live runtime", () => {
    expect(
      findReadyPreviewEndpoint({
        sessionGroupId: "group-1",
        endpoints: [endpoint],
        processes: [{ ...endpoint, status: "running", runtimeInstanceId: "runtime-new" }],
        activeRuntimeInstanceId: "runtime-new",
      }),
    ).toBe(endpoint);
  });

  it("keeps matching when either runtime instance is unknown", () => {
    expect(
      findReadyPreviewEndpoint({
        sessionGroupId: "group-1",
        endpoints: [endpoint],
        processes: [{ ...endpoint, status: "running", runtimeInstanceId: "runtime-old" }],
        activeRuntimeInstanceId: null,
      }),
    ).toBe(endpoint);
    expect(
      findReadyPreviewEndpoint({
        sessionGroupId: "group-1",
        endpoints: [endpoint],
        processes: [{ ...endpoint, status: "running" }],
        activeRuntimeInstanceId: "runtime-new",
      }),
    ).toBe(endpoint);
  });
});

describe("isLivePreviewRuntimeAvailable", () => {
  it("only uses live endpoints while their runtime can serve traffic", () => {
    expect(isLivePreviewRuntimeAvailable("connected")).toBe(true);
    expect(isLivePreviewRuntimeAvailable("degraded")).toBe(true);
    expect(isLivePreviewRuntimeAvailable("disconnected")).toBe(false);
    expect(isLivePreviewRuntimeAvailable("deprovisioned")).toBe(false);
    expect(isLivePreviewRuntimeAvailable("provisioning")).toBe(false);
  });
});
