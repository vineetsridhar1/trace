import { describe, expect, it } from "vitest";
import { deferredDeliveryMessage } from "./delivery-deferred.js";

describe("deferredDeliveryMessage", () => {
  it("tells the user to resend only when they were the sender", () => {
    for (const operation of ["send", "run"]) {
      expect(deferredDeliveryMessage({ operation })).toContain("Send it again");
    }
  });

  // persistConnectionFailure runs for ten operations; eight are Trace's own
  // replays and recoveries, where "send again" is advice about nothing.
  it("stays neutral for operations the user did not initiate", () => {
    for (const operation of [
      "pending_replay",
      "workspace_replay",
      "group_workspace_replay",
      "tool_session_recovery",
      "retry_prepare",
      "retry_replay",
      "move_run",
      "upgrade_workspace",
    ]) {
      const message = deferredDeliveryMessage({ operation });
      expect(message).not.toContain("Send it again");
      expect(message).toContain("didn't run");
    }
  });

  it("stays neutral when the operation is missing or malformed", () => {
    expect(deferredDeliveryMessage(undefined)).not.toContain("Send it again");
    expect(deferredDeliveryMessage({ operation: 42 })).not.toContain("Send it again");
  });
});
