import { describe, expect, it } from "vitest";
import { mapFlyStateToTraceStatus } from "./status.js";

describe("mapFlyStateToTraceStatus", () => {
  it("maps Fly states to Trace runtime statuses", () => {
    expect(mapFlyStateToTraceStatus("created")).toBe("provisioning");
    expect(mapFlyStateToTraceStatus("starting")).toBe("booting");
    expect(mapFlyStateToTraceStatus("started")).toBe("connected");
    expect(mapFlyStateToTraceStatus("stopping")).toBe("stopping");
    expect(mapFlyStateToTraceStatus("stopped")).toBe("stopped");
    expect(mapFlyStateToTraceStatus("destroyed")).toBe("stopped");
    expect(mapFlyStateToTraceStatus("failed")).toBe("failed");
    expect(mapFlyStateToTraceStatus("unknown-state")).toBe("unknown");
  });
});
