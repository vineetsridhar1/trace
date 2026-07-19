import { describe, expect, it } from "vitest";
import { injectAuthoringOverlay } from "./endpoint-proxy.js";

describe("endpoint authoring overlay", () => {
  it("discovers selectable design targets from the canvas manifest", () => {
    const result = injectAuthoringOverlay(
      { "content-type": "text/html; charset=utf-8", "content-length": "42" },
      Buffer.from("<!doctype html><html><head></head><body><div id=\"root\"></div></body></html>"),
    );
    const html = result.body.toString("utf8");

    expect(html).toContain("fetch('/design.canvas.json'");
    expect(html).toContain("[data-screen-id]");
    expect(html).toContain("data-trace-auto-target");
    expect(html).toContain("data-trace-id','auto-");
    expect(html).toContain('post("edit-mode-ready",{})');
    expect(result.headers).not.toHaveProperty("content-length");
  });

  it("leaves encoded responses untouched", () => {
    const body = Buffer.from("<html><body>Compressed upstream payload</body></html>");
    const result = injectAuthoringOverlay(
      { "content-type": "text/html", "content-encoding": "gzip" },
      body,
    );

    expect(result.body).toBe(body);
    expect(result.body.toString("utf8")).not.toContain("data-trace-app-overlay");
  });
});
