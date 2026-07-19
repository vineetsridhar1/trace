import { describe, expect, it } from "vitest";
import {
  appPreviewReducer,
  initialAppPreviewState,
  MAX_FRAME_RETRIES,
  type AppPreviewState,
} from "./app-preview-state";

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

  it("shows the loading line again when a manual refresh remounts the frame", () => {
    const loaded = appPreviewReducer(
      appPreviewReducer(initialAppPreviewState, {
        type: "request-succeeded",
        url: "https://preview.test/auth-1",
      }),
      { type: "frame-loaded" },
    );
    const refreshing = appPreviewReducer(loaded, { type: "reload" });

    // The existing frame stays visible while the new preview URL is fetched.
    expect(refreshing).toMatchObject({
      url: "https://preview.test/auth-1",
      frameLoaded: true,
      refreshing: true,
    });

    // Once the fresh URL arrives the iframe remounts (new frameRevision), so the
    // loaded flag resets and the loading line appears above the blank frame.
    expect(
      appPreviewReducer(refreshing, {
        type: "request-succeeded",
        url: "https://preview.test/auth-2",
      }),
    ).toMatchObject({
      url: "https://preview.test/auth-2",
      frameLoaded: false,
      frameRevision: 2,
      refreshing: false,
    });
  });

  it("keeps retrying a preview that is temporarily unavailable", () => {
    let state: AppPreviewState = appPreviewReducer(initialAppPreviewState, {
      type: "request-succeeded",
      url: "https://preview.test/auth-1",
    });

    for (let i = 0; i < 5; i++) {
      state = appPreviewReducer(state, { type: "frame-retry" });
      expect(state.attempts).toBe(i + 1);
      expect(state.error).toBeNull();
      expect(state.requestRevision).toBe(i + 1);
    }

    const retried = appPreviewReducer(state, { type: "reload" });
    expect(retried.error).toBeNull();
    expect(retried.attempts).toBe(0);
    expect(retried.requestRevision).toBe(6);
  });

  it("stops retrying a preview that remains unavailable", () => {
    let state = appPreviewReducer(initialAppPreviewState, {
      type: "request-succeeded",
      url: "https://preview.test/auth-1",
    });
    for (let i = 0; i <= MAX_FRAME_RETRIES; i++) {
      state = appPreviewReducer(state, { type: "frame-retry" });
    }
    expect(state.error).toContain("did not recover");
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
