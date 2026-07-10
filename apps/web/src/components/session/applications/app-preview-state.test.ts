import { describe, expect, it } from "vitest";
import { appPreviewReducer, initialAppPreviewState } from "./app-preview-state";

describe("appPreviewReducer", () => {
  it("uses loading state for the initial preview", () => {
    expect(initialAppPreviewState).toMatchObject({
      url: null,
      frameLoaded: false,
      refreshing: false,
    });
  });

  it("keeps the initial skeleton while retrying a frame that never loaded", () => {
    const waiting = appPreviewReducer(initialAppPreviewState, {
      type: "request-succeeded",
      url: "https://preview.test/auth-1",
    });

    expect(appPreviewReducer(waiting, { type: "reload" })).toMatchObject({
      url: "https://preview.test/auth-1",
      frameLoaded: false,
      refreshing: true,
      requestRevision: 1,
    });
  });

  it("preserves a loaded frame throughout a manual refresh", () => {
    const loaded = appPreviewReducer(
      appPreviewReducer(initialAppPreviewState, {
        type: "request-succeeded",
        url: "https://preview.test/auth-1",
      }),
      { type: "frame-loaded" },
    );
    const refreshing = appPreviewReducer(loaded, { type: "reload" });

    expect(refreshing).toMatchObject({
      url: "https://preview.test/auth-1",
      frameLoaded: true,
      refreshing: true,
    });

    expect(
      appPreviewReducer(refreshing, {
        type: "request-succeeded",
        url: "https://preview.test/auth-2",
      }),
    ).toMatchObject({
      url: "https://preview.test/auth-2",
      frameLoaded: true,
      frameRevision: 2,
      refreshing: false,
    });
  });

  it("keeps a working preview visible when refresh authentication fails", () => {
    const loaded = {
      ...initialAppPreviewState,
      frameLoaded: true,
      refreshing: true,
      url: "https://preview.test",
    };

    expect(
      appPreviewReducer(loaded, { type: "request-failed", error: "Network error" }),
    ).toMatchObject({
      url: "https://preview.test",
      frameLoaded: true,
      error: null,
      refreshing: false,
    });
  });
});
