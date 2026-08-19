import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeRuntimeAccessInfo } from "./useBridgeRuntimeAccess";
import { SessionRecoveryPanel } from "./SessionRecoveryPanel";

const mocks = vi.hoisted(() => ({
  access: null as BridgeRuntimeAccessInfo | null,
  mutation: vi.fn(),
}));

vi.mock("../../lib/urql", () => ({ client: { mutation: mocks.mutation } }));
vi.mock("@trace/client-core", () => ({
  formatSessionConnectionError: (message: string | null) => message,
  RETRY_SESSION_CONNECTION_MUTATION: "retry-session-connection",
  useEntityField: () => "group-1",
}));
vi.mock("./useBridgeRuntimeAccess", () => ({
  isBridgeInteractionAllowed: () => true,
  useBridgeRuntimeAccess: () => ({ access: mocks.access }),
}));
vi.mock("./SessionRuntimePicker", () => ({ SessionRuntimePicker: () => null }));

function bridgeAccess(overrides: Partial<BridgeRuntimeAccessInfo> = {}): BridgeRuntimeAccessInfo {
  return {
    runtimeInstanceId: "runtime-1",
    hostingMode: "local",
    connected: false,
    allowed: true,
    isOwner: true,
    ...overrides,
  };
}

const retryableConnection = {
  state: "disconnected",
  runtimeInstanceId: "runtime-1",
  canRetry: true,
  autoRetryable: false,
};
const mountedRenderers: ReactTestRenderer[] = [];

async function renderPanel(
  connection: Record<string, unknown> = retryableConnection,
): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<SessionRecoveryPanel sessionId="session-1" connection={connection} />);
  });
  mountedRenderers.push(renderer);
  return renderer;
}

describe("SessionRecoveryPanel retry policy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.access = null;
    mocks.mutation.mockReset().mockReturnValue({
      toPromise: vi.fn().mockResolvedValue({}),
    });
  });

  afterEach(async () => {
    await act(async () => {
      for (const renderer of mountedRenderers) renderer.unmount();
    });
    mountedRenderers.length = 0;
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not auto-retry a non-transient failure, even for the local bridge owner", async () => {
    mocks.access = bridgeAccess();
    await renderPanel();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("does not turn remounts into retries for a non-transient failure", async () => {
    mocks.access = bridgeAccess();
    const failed = { ...retryableConnection, lastError: "worktree in use" };
    const renderer = await renderPanel(failed);
    await act(async () => renderer.unmount());
    mountedRenderers.length = 0;
    await renderPanel(failed);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("uses the single backoff policy for transient failures", async () => {
    const connection = { ...retryableConnection, autoRetryable: true };
    await renderPanel(connection);

    expect(mocks.mutation).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(mocks.mutation).toHaveBeenCalledTimes(1);
    expect(mocks.mutation).toHaveBeenCalledWith("retry-session-connection", {
      sessionId: "session-1",
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(mocks.mutation).toHaveBeenCalledTimes(2);
  });
});
