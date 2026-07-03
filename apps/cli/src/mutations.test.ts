import { describe, expect, it } from "vitest";
import type { GqlClient } from "@trace/client-core/headless";
import { promptSession, sendToChannel, startNewSession, stopSession } from "./mutations.js";

interface RecordedCall {
  query: string;
  variables: Record<string, unknown>;
}

function mockClient(data: unknown): { client: GqlClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const client = {
    mutation: (document: unknown, variables: Record<string, unknown>) => {
      const query =
        typeof document === "string" ? document : JSON.stringify(document).slice(0, 2000);
      calls.push({ query, variables });
      return { toPromise: () => Promise.resolve({ data }) };
    },
  } as unknown as GqlClient;
  return { client, calls };
}

describe("sendToChannel", () => {
  it("routes text channels through sendChannelMessage with escaped HTML", async () => {
    const { client, calls } = mockClient({ sendChannelMessage: { id: "msg-1" } });
    const result = await sendToChannel(
      client,
      { id: "chan-1", type: "text" },
      "hi <b>&</b>\nsecond line",
    );
    expect(result).toEqual({ id: "msg-1" });
    expect(calls[0]?.variables).toEqual({
      channelId: "chan-1",
      html: "<p>hi &lt;b&gt;&amp;&lt;/b&gt;<br />second line</p>",
    });
  });

  it("routes coding channels through sendMessage with plain text", async () => {
    const { client, calls } = mockClient({ sendMessage: { id: "evt-1" } });
    const result = await sendToChannel(client, { id: "chan-2", type: "coding" }, "plain text");
    expect(result).toEqual({ id: "evt-1" });
    expect(calls[0]?.variables).toEqual({ channelId: "chan-2", text: "plain text" });
  });
});

describe("promptSession", () => {
  it("queues while the agent is busy", async () => {
    const { client, calls } = mockClient({ queueSessionMessage: { id: "queued-1" } });
    const result = await promptSession(
      client,
      { id: "sess-1", agentStatus: "active" },
      "steer this",
    );
    expect(result).toEqual({ id: "queued-1", queued: true });
    expect(calls[0]?.variables).toEqual({ sessionId: "sess-1", text: "steer this" });
  });

  it("sends when the agent is idle", async () => {
    const { client } = mockClient({ sendSessionMessage: { id: "evt-2" } });
    const result = await promptSession(client, { id: "sess-1", agentStatus: "done" }, "next task");
    expect(result).toEqual({ id: "evt-2", queued: false });
  });
});

describe("startNewSession", () => {
  it("omits unset input fields", async () => {
    const { client, calls } = mockClient({
      startSession: { id: "sess-9", sessionGroupId: "group-9" },
    });
    const result = await startNewSession(client, { repoId: "repo-1", prompt: "hello" });
    expect(result).toEqual({ id: "sess-9", sessionGroupId: "group-9" });
    expect(calls[0]?.variables).toEqual({ input: { repoId: "repo-1", prompt: "hello" } });
  });
});

describe("stopSession", () => {
  it("terminates by ID", async () => {
    const { client, calls } = mockClient({ terminateSession: { id: "sess-1" } });
    await expect(stopSession(client, "sess-1")).resolves.toEqual({ id: "sess-1" });
    expect(calls[0]?.variables).toEqual({ id: "sess-1" });
  });
});

// The documented --json confirmation shapes printed by the write commands.
describe("stable --json confirmation shapes", () => {
  it("send / sessions new / sessions prompt / sessions stop", () => {
    expect({ id: "msg-1", channelId: "chan-1" }).toMatchInlineSnapshot(`
      {
        "channelId": "chan-1",
        "id": "msg-1",
      }
    `);
    expect({ id: "sess-9", sessionGroupId: "group-9" }).toMatchInlineSnapshot(`
      {
        "id": "sess-9",
        "sessionGroupId": "group-9",
      }
    `);
    expect({ id: "evt-2", sessionId: "sess-1", queued: false }).toMatchInlineSnapshot(`
      {
        "id": "evt-2",
        "queued": false,
        "sessionId": "sess-1",
      }
    `);
    expect({ id: "sess-1" }).toMatchInlineSnapshot(`
      {
        "id": "sess-1",
      }
    `);
  });
});
