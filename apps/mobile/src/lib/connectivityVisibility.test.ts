import { describe, expect, it } from "vitest";
import {
  FOREGROUND_GRACE_MS,
  OFFLINE_DELAY_MS,
  RECONNECTING_DELAY_MS,
  getAppConnectivityBannerKind,
  shouldShowSessionConnectionLost,
  shouldTickConnectivityClock,
} from "./connectivityVisibility";

const baseInput = {
  appActive: true,
  disconnectedAt: null,
  foregroundedAt: 1_000,
  hasConnectedBefore: true,
  isConnected: true,
  isResolved: true,
  networkDisconnectedAt: null,
  now: 1_000 + FOREGROUND_GRACE_MS,
  wsConnected: true,
};

describe("connectivity visibility", () => {
  it("suppresses app connectivity banners during foreground grace", () => {
    expect(
      getAppConnectivityBannerKind({
        ...baseInput,
        disconnectedAt: 500,
        now: 1_000 + FOREGROUND_GRACE_MS - 1,
        wsConnected: false,
      }),
    ).toBeNull();
  });

  it("shows offline only after foreground and offline delays pass", () => {
    expect(
      getAppConnectivityBannerKind({
        ...baseInput,
        isConnected: false,
        networkDisconnectedAt: 1_000 + FOREGROUND_GRACE_MS,
        now: 1_000 + FOREGROUND_GRACE_MS + OFFLINE_DELAY_MS - 1,
      }),
    ).toBeNull();

    expect(
      getAppConnectivityBannerKind({
        ...baseInput,
        isConnected: false,
        networkDisconnectedAt: 1_000 + FOREGROUND_GRACE_MS,
        now: 1_000 + FOREGROUND_GRACE_MS + OFFLINE_DELAY_MS,
      }),
    ).toBe("offline");
  });

  it("shows reconnecting only after foreground and reconnect delays pass", () => {
    expect(
      getAppConnectivityBannerKind({
        ...baseInput,
        disconnectedAt: 1_000,
        now: 1_000 + RECONNECTING_DELAY_MS - 1,
        wsConnected: false,
      }),
    ).toBeNull();

    expect(
      getAppConnectivityBannerKind({
        ...baseInput,
        disconnectedAt: 1_000,
        now: 1_000 + RECONNECTING_DELAY_MS,
        wsConnected: false,
      }),
    ).toBe("reconnecting");
  });

  it("suppresses the session connection lost banner during foreground grace", () => {
    expect(
      shouldShowSessionConnectionLost({
        appActive: true,
        foregroundedAt: 1_000,
        now: 1_000 + FOREGROUND_GRACE_MS - 1,
      }),
    ).toBe(false);

    expect(
      shouldShowSessionConnectionLost({
        appActive: true,
        foregroundedAt: 1_000,
        now: 1_000 + FOREGROUND_GRACE_MS,
      }),
    ).toBe(true);
  });

  it("ticks while a delayed state may become visible", () => {
    expect(
      shouldTickConnectivityClock({
        ...baseInput,
        now: 1_000 + FOREGROUND_GRACE_MS - 1,
      }),
    ).toBe(true);

    expect(
      shouldTickConnectivityClock({
        ...baseInput,
        isConnected: false,
        networkDisconnectedAt: 1_000 + FOREGROUND_GRACE_MS,
      }),
    ).toBe(true);

    expect(shouldTickConnectivityClock(baseInput)).toBe(false);
  });
});
