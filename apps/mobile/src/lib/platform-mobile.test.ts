import type { Platform } from "@trace/client-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setPlatform: vi.fn<(platform: Platform) => void>(),
}));

vi.mock("@trace/client-core", () => ({
  setPlatform: mocks.setPlatform,
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  }),
}));

vi.mock("@/lib/connection-target", () => ({
  getActiveApiUrl: () => "https://app.gettrace.org",
  hasHostedApiUrlConfigured: () => true,
}));

describe("mobile platform WebSocket factory", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("__DEV__", false);
    mocks.setPlatform.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds the mobile User-Agent header to native WebSockets", async () => {
    const nativeConstructor =
      vi.fn<
        (
          url: string,
          protocols?: string | string[],
          options?: { headers?: Record<string, string> },
        ) => void
      >();
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor(
          url: string,
          protocols?: string | string[],
          options?: { headers?: Record<string, string> },
        ) {
          nativeConstructor(url, protocols, options);
        }
      },
    );

    await import("./platform-mobile");

    const platform = mocks.setPlatform.mock.calls[0]?.[0] as Platform;
    platform.createWebSocket("wss://app.gettrace.org/terminal", ["terminal"]);

    expect(nativeConstructor).toHaveBeenCalledWith(
      "wss://app.gettrace.org/terminal",
      ["terminal"],
      {
        headers: { "User-Agent": "TraceMobile" },
      },
    );
  });
});
