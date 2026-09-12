import { describe, expect, it } from "vitest";
import {
  canonicalSessionConnection,
  runtimeInstanceIdFromConnection,
} from "./session-runtime-connection.js";

describe("canonical runtime ownership", () => {
  const stale = { runtimeInstanceId: "old", version: 999 };
  it("uses the group even when a session has a higher independent version", () => {
    const connection = { runtimeInstanceId: "new", version: 1 };
    expect(canonicalSessionConnection({ connection: stale, sessionGroup: { connection } })).toBe(
      connection,
    );
  });
  it.each([null, {}])(
    "does not resurrect a cleared or unloaded group connection (%s)",
    (connection) => {
      expect(canonicalSessionConnection({ connection: stale, sessionGroup: { connection } })).toBe(
        connection,
      );
    },
  );
  it("fails closed when a grouped session's group was not loaded", () => {
    expect(canonicalSessionConnection({ connection: stale, sessionGroupId: "group-1" })).toBeNull();
    expect(canonicalSessionConnection({ connection: stale, sessionGroup: {} })).toBeNull();
  });
  it("retains ownership for genuinely ungrouped legacy sessions", () => {
    expect(
      canonicalSessionConnection({ connection: stale, sessionGroupId: null, sessionGroup: null }),
    ).toBe(stale);
  });
  it.each([null, [], {}, { runtimeInstanceId: 3 }, { runtimeInstanceId: " " }])(
    "rejects malformed runtime identities (%s)",
    (connection) => {
      expect(runtimeInstanceIdFromConnection(connection)).toBeNull();
    },
  );
});
