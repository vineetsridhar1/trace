import { beforeEach, describe, expect, it, vi } from "vitest";

const replaceMock = vi.fn();
const alertMock = vi.fn();
const mutationMock = vi.fn();
const fetchSessionGroupDetailMock = vi.fn();
const setOverlaySessionIdMock = vi.fn();
const lightMock = vi.fn();
const successMock = vi.fn();
const errorMock = vi.fn();

const START_SESSION_MUTATION = "START_SESSION_MUTATION";
const RUN_SESSION_MUTATION = "RUN_SESSION_MUTATION";
const TERMINATE_SESSION_MUTATION = "TERMINATE_SESSION_MUTATION";

const entityState = {
  sessions: {
    source_session: {
      id: "source_session",
      sessionGroupId: "group_1",
      tool: "claude_code",
      model: "sonnet",
      hosting: "cloud",
      repo: { id: "repo_source" },
      branch: "feature",
    },
  } as Record<string, Record<string, unknown>>,
  sessionGroups: {
    group_1: {
      id: "group_1",
      repo: { id: "repo_group" },
      branch: "group-branch",
    },
  } as Record<string, Record<string, unknown>>,
  _sessionIdsByGroup: {
    group_1: ["source_session"],
  } as Record<string, string[]>,
};

vi.mock("expo-router", () => ({
  router: { replace: replaceMock },
}));

vi.mock("react-native", () => ({
  Alert: { alert: alertMock },
}));

vi.mock("@trace/client-core", () => ({
  generateUUID: vi.fn(),
  getSessionChannelId: vi.fn(() => "channel_fallback"),
  getSessionGroupChannelId: vi.fn(() => "channel_group"),
  insertOptimisticSessionPair: vi.fn(),
  reconcileOptimisticSessionPair: vi.fn(),
  rollbackOptimisticSessionPair: vi.fn(),
  START_SESSION_MUTATION,
  RUN_SESSION_MUTATION,
  TERMINATE_SESSION_MUTATION,
  useEntityStore: {
    getState: () => entityState,
  },
}));

vi.mock("@/lib/urql", () => ({
  getClient: () => ({
    mutation: mutationMock,
  }),
}));

vi.mock("@/hooks/useSessionGroupDetail", () => ({
  fetchSessionGroupDetail: fetchSessionGroupDetailMock,
}));

vi.mock("@/stores/ui", () => ({
  useMobileUIStore: {
    getState: () => ({
      setOverlaySessionId: setOverlaySessionIdMock,
      overlaySessionId: null,
    }),
  },
}));

vi.mock("@/lib/haptics", () => ({
  haptic: {
    light: lightMock,
    success: successMock,
    error: errorMock,
  },
}));

vi.mock("@/lib/connection-target", () => ({
  getConnectionMode: vi.fn(() => "hosted"),
}));

vi.mock("@/lib/session-hosting", () => ({
  resolveMobileSessionHosting: vi.fn(() => "cloud"),
}));

vi.mock("@/lib/sessionPlayer", () => ({
  closeSessionPlayer: vi.fn(),
  tryOpenSessionPlayer: vi.fn(),
}));

describe("startPlanImplementationSession", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    alertMock.mockReset();
    mutationMock.mockReset();
    fetchSessionGroupDetailMock.mockReset();
    setOverlaySessionIdMock.mockReset();
    lightMock.mockReset();
    successMock.mockReset();
    errorMock.mockReset();
  });

  it("starts, runs, navigates, and terminates the source session", async () => {
    mutationMock.mockImplementation((document: string) => {
      if (document === START_SESSION_MUTATION) {
        return {
          toPromise: async () => ({
            data: { startSession: { id: "session_new", sessionGroupId: "group_1" } },
          }),
        };
      }
      if (document === RUN_SESSION_MUTATION) {
        return { toPromise: async () => ({ data: { runSession: { id: "session_new" } } }) };
      }
      if (document === TERMINATE_SESSION_MUTATION) {
        return { toPromise: async () => ({ data: { terminateSession: { id: "source_session" } } }) };
      }
      throw new Error(`Unexpected mutation ${document}`);
    });
    fetchSessionGroupDetailMock.mockResolvedValue(true);

    const { startPlanImplementationSession } = await import("./createQuickSession");
    const ok = await startPlanImplementationSession("source_session", "Ship it");

    expect(ok).toBe(true);
    expect(fetchSessionGroupDetailMock).toHaveBeenCalledWith("group_1");
    expect(setOverlaySessionIdMock).toHaveBeenCalledWith("session_new");
    expect(replaceMock).toHaveBeenCalledWith("/sessions/group_1/session_new");
    expect(mutationMock).toHaveBeenCalledTimes(3);
    expect(mutationMock).toHaveBeenNthCalledWith(
      3,
      TERMINATE_SESSION_MUTATION,
      { id: "source_session" },
    );
  });

  it("returns false and does not navigate when the run step fails", async () => {
    mutationMock.mockImplementation((document: string) => {
      if (document === START_SESSION_MUTATION) {
        return {
          toPromise: async () => ({
            data: { startSession: { id: "session_new", sessionGroupId: "group_1" } },
          }),
        };
      }
      if (document === RUN_SESSION_MUTATION) {
        return {
          toPromise: async () => ({
            error: new Error("run failed"),
          }),
        };
      }
      throw new Error(`Unexpected mutation ${document}`);
    });

    const { startPlanImplementationSession } = await import("./createQuickSession");
    const ok = await startPlanImplementationSession("source_session", "Ship it");

    expect(ok).toBe(false);
    expect(replaceMock).not.toHaveBeenCalled();
    expect(setOverlaySessionIdMock).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledWith("Couldn't start implementation", "run failed");
  });
});
