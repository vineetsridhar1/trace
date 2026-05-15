import { describe, expect, it } from "vitest";
import {
  attachmentKeysFromPayload,
  hasAttachmentKeys,
  hasVisibleUserSessionContent,
} from "../src/index.js";

describe("session content helpers", () => {
  it("detects visible user text for session prompts and follow-up messages", () => {
    expect(hasVisibleUserSessionContent("session_started", { prompt: "Build it" })).toBe(true);
    expect(hasVisibleUserSessionContent("message_sent", { text: "Looks good" })).toBe(true);
  });

  it("treats attachment-only session messages as visible", () => {
    expect(
      hasVisibleUserSessionContent("message_sent", {
        text: "",
        attachmentKeys: ["uploads/org-1/image.png"],
      }),
    ).toBe(true);
  });

  it("falls back to legacy imageKeys when attachmentKeys are absent", () => {
    expect(
      hasVisibleUserSessionContent("message_sent", {
        text: "",
        imageKeys: ["uploads/org-1/image.png"],
      }),
    ).toBe(true);
    expect(attachmentKeysFromPayload({ imageKeys: ["uploads/org-1/image.png"] })).toEqual([
      "uploads/org-1/image.png",
    ]);
  });

  it("does not treat whitespace or empty attachment arrays as visible", () => {
    expect(hasVisibleUserSessionContent("message_sent", { text: "   " })).toBe(false);
    expect(
      hasVisibleUserSessionContent("message_sent", {
        text: "",
        attachmentKeys: [],
        imageKeys: [],
      }),
    ).toBe(false);
    expect(hasAttachmentKeys({ attachmentKeys: [] })).toBe(false);
    expect(hasAttachmentKeys({ attachmentKeys: [""] })).toBe(false);
  });

  it("prefers attachmentKeys over imageKeys", () => {
    expect(
      attachmentKeysFromPayload({
        attachmentKeys: ["uploads/org-1/file.txt"],
        imageKeys: ["uploads/org-1/image.png"],
      }),
    ).toEqual(["uploads/org-1/file.txt"]);
  });
});
