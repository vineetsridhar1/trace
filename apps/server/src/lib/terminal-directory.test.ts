import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, string>(),
  sets: new Map<string, Set<string>>(),
  mget: vi.fn(),
  smembers: vi.fn(),
  srem: vi.fn(),
}));

vi.mock("./redis.js", () => ({
  redis: {
    set: vi.fn(async (key: string, value: string) => {
      mocks.store.set(key, value);
      return "OK";
    }),
    get: vi.fn(async (key: string) => mocks.store.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      mocks.store.delete(key);
      return 1;
    }),
    sadd: vi.fn(async (key: string, ...members: string[]) => {
      const set = mocks.sets.get(key) ?? new Set<string>();
      for (const member of members) set.add(member);
      mocks.sets.set(key, set);
      return members.length;
    }),
    srem: vi.fn(async (key: string, ...members: string[]) => {
      mocks.srem(key, ...members);
      const set = mocks.sets.get(key);
      for (const member of members) set?.delete(member);
      return members.length;
    }),
    smembers: vi.fn(async (key: string) => {
      mocks.smembers(key);
      return [...(mocks.sets.get(key) ?? [])];
    }),
    mget: vi.fn(async (keys: string[]) => {
      mocks.mget(keys);
      return keys.map((key) => mocks.store.get(key) ?? null);
    }),
    pexpire: vi.fn(async () => 1),
  },
}));

vi.mock("./realtime-backplane.js", () => ({
  realtimeBackplane: { replicaId: "replica-local", enabled: true },
}));

import { TerminalDirectory } from "./terminal-directory.js";

function sessionDescriptor(terminalId: string, overrides: Record<string, unknown> = {}) {
  return {
    terminalId,
    kind: "session" as const,
    sessionId: "session-1",
    sessionGroupId: "group-1",
    ownerUserId: "user-1",
    runtimeInstanceId: "runtime-1",
    organizationId: "org-1",
    ...overrides,
  };
}

describe("TerminalDirectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.store.clear();
    mocks.sets.clear();
  });

  it("indexes a session terminal under every scope it belongs to", async () => {
    const directory = new TerminalDirectory();
    directory.register(sessionDescriptor("term-1"));
    await vi.waitFor(() => expect(mocks.sets.size).toBe(2));

    await expect(directory.listForScope({ kind: "group", id: "group-1" })).resolves.toMatchObject([
      { terminalId: "term-1" },
    ]);
    await expect(
      directory.listForScope({ kind: "session", id: "session-1" }),
    ).resolves.toMatchObject([{ terminalId: "term-1" }]);
  });

  it("indexes a channel terminal under its channel", async () => {
    const directory = new TerminalDirectory();
    directory.register(
      sessionDescriptor("term-1", {
        kind: "channel",
        sessionId: "channel:channel-1",
        sessionGroupId: null,
        channelId: "channel-1",
        repoId: "repo-1",
      }),
    );
    await vi.waitFor(() => expect(mocks.sets.size).toBe(2));

    await expect(
      directory.listForScope({ kind: "channel", id: "channel-1" }),
    ).resolves.toMatchObject([{ terminalId: "term-1" }]);
  });

  it("reads a scope's descriptors in one batch", async () => {
    const owner = new TerminalDirectory();
    owner.register(sessionDescriptor("term-1"));
    owner.register(sessionDescriptor("term-2"));
    await vi.waitFor(() =>
      expect(mocks.sets.get("trace:terminal-scope:v1:group:group-1")?.size).toBe(2),
    );

    // Read as another replica would, with nothing cached: the listing must not
    // fan out into one request per member.
    const listed = await new TerminalDirectory().listForScope({ kind: "group", id: "group-1" });

    expect(listed).toHaveLength(2);
    expect(mocks.mget).toHaveBeenCalledTimes(1);
  });

  it("drops a scope member whose descriptor is gone", async () => {
    const owner = new TerminalDirectory();
    owner.register(sessionDescriptor("term-1"));
    owner.register(sessionDescriptor("term-2"));
    await vi.waitFor(() =>
      expect(mocks.sets.get("trace:terminal-scope:v1:group:group-1")?.size).toBe(2),
    );

    // A replica that died mid-cleanup leaves the member behind with no
    // descriptor; the next read has to prune it rather than report a terminal.
    mocks.store.delete("trace:terminal:v1:term-2");

    await expect(
      new TerminalDirectory().listForScope({ kind: "group", id: "group-1" }),
    ).resolves.toMatchObject([{ terminalId: "term-1" }]);
    expect(mocks.srem).toHaveBeenCalledWith("trace:terminal-scope:v1:group:group-1", "term-2");
  });

  it("removes a terminal from its scopes when it goes away", async () => {
    const directory = new TerminalDirectory();
    directory.register(sessionDescriptor("term-1"));
    await vi.waitFor(() => expect(mocks.sets.size).toBe(2));

    directory.remove("term-1");
    await vi.waitFor(() =>
      expect(mocks.sets.get("trace:terminal-scope:v1:group:group-1")?.size).toBe(0),
    );

    await expect(directory.listForScope({ kind: "group", id: "group-1" })).resolves.toEqual([]);
    await expect(directory.get("term-1")).resolves.toBeUndefined();
  });
});
