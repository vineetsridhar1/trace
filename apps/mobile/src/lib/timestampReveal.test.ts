import { describe, expect, it } from "vitest";
import {
  calculateTimestampRevealX,
  TIMESTAMP_REVEAL_ACTIVATION,
  TIMESTAMP_REVEAL_DISTANCE,
} from "./timestampReveal";

describe("calculateTimestampRevealX", () => {
  it("does not reveal for left swipes", () => {
    expect(calculateTimestampRevealX(-40)).toBe(0);
  });

  it("does not reveal before the activation threshold", () => {
    expect(calculateTimestampRevealX(TIMESTAMP_REVEAL_ACTIVATION)).toBe(0);
  });

  it("reveals timestamps when swiping right past the threshold", () => {
    expect(calculateTimestampRevealX(64)).toBe(20);
  });

  it("caps the reveal distance", () => {
    expect(calculateTimestampRevealX(1000)).toBe(TIMESTAMP_REVEAL_DISTANCE);
  });
});
