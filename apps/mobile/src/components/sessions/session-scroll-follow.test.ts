import { describe, expect, it } from "vitest";
import { nextFollowLatestState } from "./session-scroll-follow";

const NEAR_BOTTOM_THRESHOLD = 120;

describe("nextFollowLatestState", () => {
  it("pauses following as soon as the user scrolls upward", () => {
    expect(
      nextFollowLatestState({
        currentlyFollowing: true,
        distanceFromBottom: 40,
        isUserScrolling: true,
        nearBottomThreshold: NEAR_BOTTOM_THRESHOLD,
        previousOffset: 1000,
        nextOffset: 998,
      }),
    ).toBe(false);
  });

  it("resumes following when the user scrolls back near the bottom", () => {
    expect(
      nextFollowLatestState({
        currentlyFollowing: false,
        distanceFromBottom: 40,
        isUserScrolling: true,
        nearBottomThreshold: NEAR_BOTTOM_THRESHOLD,
        previousOffset: 998,
        nextOffset: 1000,
      }),
    ).toBe(true);
  });

  it("stays paused away from the bottom when content changes programmatically", () => {
    expect(
      nextFollowLatestState({
        currentlyFollowing: false,
        distanceFromBottom: 400,
        isUserScrolling: false,
        nearBottomThreshold: NEAR_BOTTOM_THRESHOLD,
        previousOffset: 1000,
        nextOffset: 1000,
      }),
    ).toBe(false);
  });
});
