import { describe, expect, it } from "vitest";
import { nextFollowLatestState, offsetAfterPrepend } from "./session-scroll-follow";

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

describe("offsetAfterPrepend", () => {
  it("keeps the same visible content when rows are inserted above the viewport", () => {
    expect(
      offsetAfterPrepend({
        previousContentHeight: 2000,
        nextContentHeight: 2600,
        anchorOffset: 120,
      }),
    ).toBe(720);
  });

  it("keeps offsets non-negative when content above shrinks", () => {
    expect(
      offsetAfterPrepend({
        previousContentHeight: 2000,
        nextContentHeight: 1800,
        anchorOffset: 120,
      }),
    ).toBe(0);
  });
});
