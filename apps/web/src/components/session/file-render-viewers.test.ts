import { describe, expect, it } from "vitest";

import { getFileRenderViewer } from "./file-render-viewers";

describe("file render viewers", () => {
  it("detects markdown-like file extensions", () => {
    expect(getFileRenderViewer("README.md")?.id).toBe("markdown");
    expect(getFileRenderViewer("plans/agent-plan.MARKDOWN")?.id).toBe("markdown");
    expect(getFileRenderViewer("docs/proposal.mdx")?.id).toBe("markdown");
  });

  it("defaults supported files to rendered mode", () => {
    expect(getFileRenderViewer("plan.md")?.defaultMode).toBe("rendered");
  });

  it("leaves unsupported files without a render viewer", () => {
    expect(getFileRenderViewer("src/App.tsx")).toBeNull();
    expect(getFileRenderViewer("Makefile")).toBeNull();
  });
});
