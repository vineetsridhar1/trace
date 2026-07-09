import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEntityStore } from "@trace/client-core";
import { createQuickSession } from "./create-quick-session";

const mutationMock = vi.hoisted(() => vi.fn());
const navigateToSessionMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock("./urql", () => ({
  client: {
    mutation: mutationMock,
  },
}));

vi.mock("../stores/ui", () => ({
  navigateToSession: navigateToSessionMock,
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
  },
}));

function mockStartSessionSuccess() {
  mutationMock.mockReturnValueOnce({
    toPromise: vi.fn().mockResolvedValue({
      data: {
        startSession: {
          id: "session-1",
          sessionGroupId: "group-1",
        },
      },
    }),
  });
}

function mutationInput(): Record<string, unknown> {
  const variables = mutationMock.mock.calls[0]?.[1] as { input?: Record<string, unknown> };
  return variables.input ?? {};
}

describe("createQuickSession", () => {
  beforeEach(() => {
    mutationMock.mockReset();
    navigateToSessionMock.mockReset();
    toastErrorMock.mockReset();
    useEntityStore.setState({
      channels: {
        "channel-1": {
          id: "channel-1",
          repo: { id: "repo-1" },
        } as never,
      },
    });
  });

  it("pins app sessions to Claude Code for Open Design harness delivery", async () => {
    mockStartSessionSuccess();

    await createQuickSession("channel-1", { kind: "app" });

    expect(mutationInput()).toMatchObject({
      kind: "app",
      channelId: "channel-1",
      tool: "claude_code",
    });
    expect(mutationInput()).not.toHaveProperty("repoId");
    expect(mutationInput()).not.toHaveProperty("deferRuntimeSelection");
    expect(navigateToSessionMock).toHaveBeenCalledWith("channel-1", "group-1", "session-1");
  });

  it("keeps coding quick sessions repo-linked and deferred", async () => {
    mockStartSessionSuccess();

    await createQuickSession("channel-1");

    expect(mutationInput()).toMatchObject({
      kind: "coding",
      channelId: "channel-1",
      repoId: "repo-1",
      deferRuntimeSelection: true,
    });
    expect(mutationInput()).not.toHaveProperty("tool");
  });

  it("keeps design quick sessions serverless and repo-less", async () => {
    mockStartSessionSuccess();

    await createQuickSession("channel-1", { kind: "design" });

    expect(mutationInput()).toMatchObject({
      kind: "design",
      channelId: "channel-1",
    });
    expect(mutationInput()).not.toHaveProperty("repoId");
    expect(mutationInput()).not.toHaveProperty("tool");
    expect(mutationInput()).not.toHaveProperty("deferRuntimeSelection");
  });
});
