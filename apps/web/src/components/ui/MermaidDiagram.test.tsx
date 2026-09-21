import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MermaidDiagram } from "./MermaidDiagram";
import { MarkdownPre } from "./MarkdownPre";
import { renderMermaid } from "./mermaidRenderer";
import { useThemeStore } from "../../stores/theme";

vi.mock("./mermaidRenderer", () => ({ renderMermaid: vi.fn() }));

let renderer: ReactTestRenderer | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(renderMermaid).mockReset();
  useThemeStore.setState({ theme: "dark" });
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mount(source: string) {
  await act(async () => {
    renderer = create(<MermaidDiagram source={source} />);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  return renderer!;
}

describe("Mermaid Markdown", () => {
  it("recognizes Mermaid fences without changing ordinary code or inline code", () => {
    const render = (source: string) =>
      renderToStaticMarkup(
        <ReactMarkdown components={{ pre: MarkdownPre }}>{source}</ReactMarkdown>,
      );
    expect(render("```mermaid\ngraph TD\nA-->B\n```")).toContain("Rendering diagram");
    expect(render("```typescript\nconst value = 1;\n```")).toContain(
      '<pre><code class="language-typescript">',
    );
    expect(render("`mermaid`")).toBe("<p><code>mermaid</code></p>");
  });

  it("renders diagrams and preserves their source", async () => {
    vi.mocked(renderMermaid).mockResolvedValue("data:image/svg+xml,test");
    const view = await mount("graph TD; A-->B");
    expect(view.root.findByType("img").props.src).toBe("data:image/svg+xml,test");
    expect(view.root.findByType("code").children).toEqual(["graph TD; A-->B"]);
    expect(renderMermaid).toHaveBeenCalledWith("graph TD; A-->B", "dark");
    await act(async () => {
      useThemeStore.setState({ theme: "light" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(renderMermaid).toHaveBeenLastCalledWith("graph TD; A-->B", "light");
  });

  it("falls back to source on errors and recovers when streaming completes", async () => {
    vi.mocked(renderMermaid).mockRejectedValueOnce(new Error("Invalid syntax"));
    const view = await mount("graph TD; A-->");
    expect(view.root.findByProps({ role: "status" }).children.join("")).toContain(
      "Unable to render",
    );
    expect(view.root.findByType("code").children).toEqual(["graph TD; A-->"]);
    vi.mocked(renderMermaid).mockResolvedValue("complete");
    await act(async () => {
      view.update(<MermaidDiagram source="graph TD; A-->B" />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(view.root.findByType("img").props.src).toBe("complete");
  });

  it("ignores stale renders when the source changes", async () => {
    let finishOld: ((value: string) => void) | undefined;
    vi.mocked(renderMermaid).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    const view = await mount("old");
    vi.mocked(renderMermaid).mockResolvedValue("new-image");
    await act(async () => {
      view.update(<MermaidDiagram source="new" />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await act(async () => {
      finishOld?.("old-image");
    });
    expect(view.root.findByType("img").props.src).toBe("new-image");
  });
});
