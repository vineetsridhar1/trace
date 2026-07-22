import { describe, expect, it } from "vitest";
import { injectAuthoringOverlay } from "./endpoint-proxy.js";

describe("endpoint authoring overlay", () => {
  function injectedScript(html: string): string {
    const match = html.match(/<script data-trace-app-overlay>([\s\S]*)<\/script>/u);
    if (!match?.[1]) throw new Error("Expected the authoring overlay script");
    return match[1];
  }

  it("discovers selectable design targets from the canvas manifest", () => {
    const result = injectAuthoringOverlay(
      { "content-type": "text/html; charset=utf-8", "content-length": "42" },
      Buffer.from('<!doctype html><html><head></head><body><div id="root"></div></body></html>'),
      ["https://app.trace.test", "http://localhost:3000"],
    );
    const html = result.body.toString("utf8");

    expect(html).toContain("fetch('/design.canvas.json'");
    expect(html).toContain("[data-screen-id]");
    expect(html).toContain("data-trace-auto-target");
    expect(html).toContain("data-trace-id','auto-");
    expect(html).toContain('var TRACE_ORIGINS=["https://app.trace.test","http://localhost:3000"]');
    expect(html).toContain("var TRACE_ORIGIN=null");
    expect(html).not.toContain("document.referrer");
    expect(html).toContain('e.data.type==="trace:design:handshake"');
    expect(html).toContain("TRACE_ORIGINS.indexOf(e.origin)===-1");
    expect(html).toContain('post("ready",{},TRACE_ORIGIN)');
    expect(html).toContain('post("edit-mode-ready",{})');
    expect(html).toContain("post('dom-tree',{domTree:tree})");
    expect(injectedScript(html)).toContain("replace(/\\s+/g");
    expect(html).toContain('e.data.type==="trace:design:activate-element"');
    expect(html).toContain('e.data.type==="trace:design:hover-element"');
    expect(html).toContain("boxShadow:style.boxShadow");
    expect(result.headers).not.toHaveProperty("content-length");
    expect(result.headers).toMatchObject({ "cache-control": "no-store" });
    expect(() => new Function(injectedScript(html))).not.toThrow();
  });

  it("leaves encoded responses untouched", () => {
    const body = Buffer.from("<html><body>Compressed upstream payload</body></html>");
    const result = injectAuthoringOverlay(
      { "content-type": "text/html", "content-encoding": "gzip" },
      body,
      ["https://app.trace.test"],
    );

    expect(result.body).toBe(body);
    expect(result.body.toString("utf8")).not.toContain("data-trace-app-overlay");
  });
});
