import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  subscribePullRequestStatus,
  usePullRequestStatusStore,
} from "./session-pull-request-status";
import { client } from "../lib/urql";

vi.mock("../lib/urql", () => ({ client: { query: vi.fn() } }));
const prUrl = "https://github.com/acme/project/pull/42";
const status = { prUrl, review: "approved", checks: "success" };
const key = JSON.stringify(["user", "group", prUrl]);
const stops: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  usePullRequestStatusStore.setState({ statuses: {} });
  vi.mocked(client.query).mockReturnValue({
    toPromise: async () => ({ data: { sessionGroupPullRequestStatuses: [status] } }),
  } as unknown as ReturnType<typeof client.query>);
});
afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  vi.useRealTimers();
});

it("shares polling across rows and stops after the final row unmounts", async () => {
  const stopFirst = subscribePullRequestStatus("group", prUrl, "user");
  stops.push(subscribePullRequestStatus("group", prUrl, "user"));
  await vi.advanceTimersByTimeAsync(100);
  expect(client.query).toHaveBeenCalledTimes(1);
  expect(usePullRequestStatusStore.getState().statuses[key]).toEqual(status);
  stopFirst();
  await vi.advanceTimersByTimeAsync(29_999);
  expect(client.query).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(client.query).toHaveBeenCalledTimes(2);
  stops.pop()!();
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(client.query).toHaveBeenCalledTimes(2);
  expect(usePullRequestStatusStore.getState().statuses[key]).toBeUndefined();
});

it("clears a passing status after a failed refresh instead of leaving stale green icons", async () => {
  stops.push(subscribePullRequestStatus("group", prUrl, "user"));
  await vi.advanceTimersByTimeAsync(100);
  expect(usePullRequestStatusStore.getState().statuses[key]).toEqual(status);
  vi.mocked(client.query).mockReturnValue({
    toPromise: async () => {
      throw new Error("offline");
    },
  } as unknown as ReturnType<typeof client.query>);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(usePullRequestStatusStore.getState().statuses[key]).toBeNull();
});

it("coalesces different rows, and newly displayed rows do not refetch fresh rows", async () => {
  stops.push(subscribePullRequestStatus("group", prUrl, "user"));
  stops.push(subscribePullRequestStatus("other", prUrl + "0", "user"));
  await vi.advanceTimersByTimeAsync(100);
  expect(client.query).toHaveBeenCalledTimes(1);
  expect(vi.mocked(client.query).mock.calls[0][1]).toEqual({ ids: ["group", "other"] });
  await vi.advanceTimersByTimeAsync(10_000);
  expect(client.query).toHaveBeenCalledTimes(1);
  stops.push(subscribePullRequestStatus("new", prUrl + "1", "user"));
  await vi.advanceTimersByTimeAsync(100);
  expect(vi.mocked(client.query).mock.calls[1][1]).toEqual({ ids: ["new"] });
});

it("pauses in hidden tabs and refreshes overdue rows on return", async () => {
  let visibilityChanged: (() => void) | undefined;
  const doc = {
    hidden: true,
    addEventListener: vi.fn((_event: string, cb: () => void) => {
      visibilityChanged = cb;
    }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("document", doc);
  try {
    stops.push(subscribePullRequestStatus("group", prUrl, "user"));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(client.query).not.toHaveBeenCalled();
    doc.hidden = false;
    visibilityChanged!();
    await vi.advanceTimersByTimeAsync(100);
    expect(client.query).toHaveBeenCalledTimes(1);
    stops.pop()!();
    expect(doc.removeEventListener).toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("ignores a late response after unsubscribe and remount", async () => {
  let resolve!: (value: unknown) => void;
  vi.mocked(client.query).mockReturnValue({
    toPromise: () =>
      new Promise((done) => {
        resolve = done;
      }),
  } as unknown as ReturnType<typeof client.query>);
  const stop = subscribePullRequestStatus("group", prUrl, "user");
  await vi.advanceTimersByTimeAsync(100);
  stop();
  stops.push(subscribePullRequestStatus("group", prUrl, "user"));
  resolve({ data: { sessionGroupPullRequestStatuses: [status] } });
  await vi.advanceTimersByTimeAsync(0);
  expect(usePullRequestStatusStore.getState().statuses[key]).toBeUndefined();
});
