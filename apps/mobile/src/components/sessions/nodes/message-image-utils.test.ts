import { describe, expect, it } from "vitest";
import { buildMessageImageItems, fitMessageImageSurface } from "./message-image-utils";

describe("buildMessageImageItems", () => {
  it("pairs preview URLs and image keys by index", () => {
    expect(
      buildMessageImageItems(
        ["uploads/org/key-1", "uploads/org/key-2"],
        ["file:///one.png", "file:///two.png"],
      ),
    ).toEqual([
      {
        key: "uploads/org/key-1",
        imageKey: "uploads/org/key-1",
        previewUrl: "file:///one.png",
        label: "Image 1",
      },
      {
        key: "uploads/org/key-2",
        imageKey: "uploads/org/key-2",
        previewUrl: "file:///two.png",
        label: "Image 2",
      },
    ]);
  });

  it("drops empty slots when both key and preview are missing", () => {
    expect(buildMessageImageItems([], [undefined as unknown as string])).toEqual([]);
  });
});

describe("fitMessageImageSurface", () => {
  it("fits wide images within the modal bounds", () => {
    expect(fitMessageImageSurface(400, 900, 2)).toEqual({
      width: 360,
      height: 180,
    });
  });

  it("fits tall images within the modal bounds", () => {
    expect(fitMessageImageSurface(400, 900, 0.5)).toEqual({
      width: 360,
      height: 720,
    });
  });

  it("falls back to the max bounds when the aspect ratio is unknown", () => {
    expect(fitMessageImageSurface(400, 900, null)).toEqual({
      width: 360,
      height: 740,
    });
  });
});
