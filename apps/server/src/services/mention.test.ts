import { describe, expect, it } from "vitest";
import { extractMentions, sanitizeHtml, stripHtml } from "./mention.js";

describe("mention helpers", () => {
  it("sanitizes unsafe html and trims quill trailing paragraphs", () => {
    const html = '<p>Hello<script>alert(1)</script></p><p><br></p>';

    expect(sanitizeHtml(html)).toBe("<p>Hello</p>");
  });

  it("extracts unique mentions and falls back to text names", () => {
    const html = [
      '<p>Hello <span class="mention" data-mention-id="u1" data-mention-value="Alice">@Alice</span></p>',
      '<p>Again <span class="mention" data-mention-id="u1">@Alice</span></p>',
      '<p>And <span class="mention" data-mention-id="u2">@Bob</span></p>',
    ].join("");

    expect(extractMentions(html)).toEqual([
      { userId: "u1", name: "Alice" },
      { userId: "u2", name: "Bob" },
    ]);
  });

  it("strips html into readable plain text", () => {
    const html = [
      '<p>Hello <span class="mention" data-mention-value="Alice">@Alice</span><br>world</p>',
      "<blockquote>quoted</blockquote>",
    ].join("");

    expect(stripHtml(html)).toBe("Hello @Alice\nworld\nquoted");
  });
});
