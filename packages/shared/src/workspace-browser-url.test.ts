import { describe, expect, it } from "vitest";
import {
  isWorkspaceBrowserUrl,
  normalizeWorkspaceBrowserUrl,
  WorkspaceBrowserUrlError,
} from "./workspace-browser-url.js";

describe("workspace browser URLs", () => {
  it("normalizes bare hosts to HTTPS", () => {
    expect(normalizeWorkspaceBrowserUrl("example.com/path")).toBe("https://example.com/path");
  });

  it("normalizes local development hosts to HTTP", () => {
    expect(normalizeWorkspaceBrowserUrl("localhost:3000")).toBe("http://localhost:3000/");
    expect(normalizeWorkspaceBrowserUrl("127.0.0.1:5173")).toBe("http://127.0.0.1:5173/");
    expect(normalizeWorkspaceBrowserUrl("[::1]:4000")).toBe("http://[::1]:4000/");
  });

  it("preserves the browser empty state", () => {
    expect(normalizeWorkspaceBrowserUrl("about:blank")).toBe("about:blank");
    expect(isWorkspaceBrowserUrl("about:blank")).toBe(true);
  });

  it("rejects non-web schemes", () => {
    expect(() => normalizeWorkspaceBrowserUrl("file:///tmp/example")).toThrow(
      WorkspaceBrowserUrlError,
    );
    expect(isWorkspaceBrowserUrl("file:///tmp/example")).toBe(false);
  });
});
