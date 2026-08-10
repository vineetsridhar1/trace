import { describe, expect, it } from "vitest";
import { cleanMessageHtml } from "./message-utils";

describe("cleanMessageHtml", () => {
  it("preserves one intentional trailing soft line break", () => {
    expect(cleanMessageHtml("<p>Message<br></p>")).toBe("<p>Message<br></p>");
  });

  it("removes Quill's empty trailing paragraph", () => {
    expect(cleanMessageHtml("<p>Message</p><p><br></p>")).toBe("<p>Message</p>");
  });
});
