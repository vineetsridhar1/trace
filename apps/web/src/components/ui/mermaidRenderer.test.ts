import { afterEach, describe, expect, it, vi } from "vitest";
import { renderMermaid } from "./mermaidRenderer";

const { initialize, render } = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: { initialize, render } }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("renderMermaid", () => {
  it("isolates SVG output and cleans up temporary DOM on success and failure", async () => {
    const remove = vi.fn();
    vi.stubGlobal("document", {
      createElement: () => ({ style: {}, remove }),
      body: { appendChild: vi.fn() },
    });
    render.mockResolvedValueOnce({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Test</text></svg>',
    });
    const image = await renderMermaid("graph TD; A-->B", "dark");
    expect(decodeURIComponent(image)).toContain("data:image/svg+xml;charset=utf-8,<svg");
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: "strict", startOnLoad: false, htmlLabels: false }),
    );
    expect(remove).toHaveBeenCalledTimes(1);
    render.mockRejectedValueOnce(new Error("invalid"));
    await expect(renderMermaid("invalid", "light")).rejects.toThrow("invalid");
    expect(remove).toHaveBeenCalledTimes(2);
    render.mockResolvedValueOnce({ svg: "<svg/>" });
    await expect(renderMermaid("graph TD; B-->C", "light")).resolves.toContain(
      "data:image/svg+xml",
    );
  });

  it("serializes configuration and rendering for multiple diagrams", async () => {
    vi.stubGlobal("document", {
      createElement: () => ({ style: {}, remove: vi.fn() }),
      body: { appendChild: vi.fn() },
    });
    let finish: ((value: { svg: string }) => void) | undefined;
    render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render.mockResolvedValueOnce({ svg: "second" });
    const first = renderMermaid("first", "dark");
    const second = renderMermaid("second", "light");
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
    expect(initialize).toHaveBeenCalledTimes(1);
    finish?.({ svg: "first" });
    await Promise.all([first, second]);
    expect(initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: "default" }));
    expect(render.mock.calls[0][0]).not.toBe(render.mock.calls[1][0]);
  });
});
