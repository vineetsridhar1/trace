import { describe, expect, it } from "vitest";
import { shouldFollowBottom } from "./sessionAutoScroll";

describe("shouldFollowBottom", () => {
  it("stops following on a small upward scroll inside the near-bottom zone", () => {
    expect(
      shouldFollowBottom({
        wasFollowing: true,
        previousScrollTop: 1_000,
        scrollTop: 980,
        distanceFromBottom: 20,
      }),
    ).toBe(false);
  });

  it("stays detached while content grows without user movement", () => {
    expect(
      shouldFollowBottom({
        wasFollowing: false,
        previousScrollTop: 980,
        scrollTop: 980,
        distanceFromBottom: 40,
      }),
    ).toBe(false);
  });

  it("resumes following when the user scrolls back toward the bottom", () => {
    expect(
      shouldFollowBottom({
        wasFollowing: false,
        previousScrollTop: 950,
        scrollTop: 980,
        distanceFromBottom: 20,
      }),
    ).toBe(true);
  });

  it("does not follow while more than the near-bottom distance away", () => {
    expect(
      shouldFollowBottom({
        wasFollowing: true,
        previousScrollTop: 800,
        scrollTop: 850,
        distanceFromBottom: 150,
      }),
    ).toBe(false);
  });
});
