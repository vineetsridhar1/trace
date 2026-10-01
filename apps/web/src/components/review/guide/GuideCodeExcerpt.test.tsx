import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuideCodeExcerpt } from "./GuideCodeExcerpt";

const query = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/urql", () => ({ client: { query } }));

const regenerate = vi.fn();

function view(
  snapshotId: string,
  startLine = 10,
  endLine = 11,
  explanation = "Validation precedes writes.",
) {
  return (
    <GuideCodeExcerpt
      reviewId="review"
      onComment={() => {}}
      onAsk={() => {}}
      snapshotId={snapshotId}
      filePath="src/a.ts"
      startLine={startLine}
      endLine={endLine}
      title="Validate"
      explanation={explanation}
      step={1}
      active
      inChanges
      onOpen={() => {}}
      onRegenerate={regenerate}
    />
  );
}
function result(snapshotId: string, startLine: number, endLine: number, content: string) {
  return {
    data: {
      reviewCodeExcerpt: {
        snapshotId,
        path: "src/a.ts",
        startLine,
        endLine,
        content,
        addedLines: [startLine],
      },
    },
  };
}

describe("Guide code excerpt", () => {
  let renderer: ReactTestRenderer;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 0),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    query.mockReset();
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    vi.unstubAllGlobals();
  });

  function toggleInfo() {
    const trigger = renderer.root
      .findAllByType("button")
      .find((node) => node.props["aria-label"] === "More info about Validate");
    act(() =>
      trigger!.props.onClick({
        button: 0,
        currentTarget: { tagName: "BUTTON" },
        nativeEvent: new Event("click"),
        preventDefault() {},
        stopPropagation() {},
      }),
    );
  }

  it("requests only the named range and keeps its explanation collapsed until expanded", async () => {
    query.mockReturnValue({
      toPromise: () => Promise.resolve(result("s1", 10, 11, "validateInput\napplyChange")),
    });
    await act(async () => {
      renderer = create(view("s1"));
    });
    expect(query.mock.calls[0]?.[1]).toEqual({
      snapshotId: "s1",
      filePath: "src/a.ts",
      startLine: 10,
      endLine: 11,
    });
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).not.toContain("Validation precedes writes.");
    toggleInfo();
    expect(JSON.stringify(renderer.toJSON())).toContain("Validation precedes writes.");
    expect(rendered).toContain("validateInput");
    expect(rendered).toContain("applyChange");
  });

  it("discards old snapshot code and refetches when either the snapshot or range changes", async () => {
    query.mockImplementation(
      (_query, variables: { snapshotId: string; startLine: number; endLine: number }) => ({
        toPromise: () =>
          Promise.resolve(
            result(
              variables.snapshotId,
              variables.startLine,
              variables.endLine,
              variables.snapshotId === "s1" ? "oldCode" : `newCode${variables.startLine}`,
            ),
          ),
      }),
    );
    await act(async () => {
      renderer = create(view("s1"));
    });
    expect(JSON.stringify(renderer.toJSON())).toContain("oldCode");
    await act(async () => {
      renderer.update(view("s2", 20, 21));
    });
    expect(JSON.stringify(renderer.toJSON())).not.toContain("oldCode");
    expect(JSON.stringify(renderer.toJSON())).toContain("newCode20");
    expect(query.mock.calls[1]?.[1]).toEqual({
      snapshotId: "s2",
      filePath: "src/a.ts",
      startLine: 20,
      endLine: 21,
    });
  });

  it("offers regeneration when a saved snippet has no explanation", async () => {
    query.mockReturnValue({
      toPromise: () => Promise.resolve(result("s1", 10, 11, "validateInput")),
    });
    await act(async () => {
      renderer = create(view("s1", 10, 11, ""));
    });
    toggleInfo();
    expect(JSON.stringify(renderer.toJSON())).toContain("This saved snippet has no explanation");
    const button = renderer.root
      .findAllByType("button")
      .find((node) => node.children.includes("Regenerate Guide"));
    act(() => button!.props.onClick());
    expect(regenerate).toHaveBeenCalled();
  });

  it("labels a clamped excerpt with the actual ending line", async () => {
    query.mockReturnValue({
      toPromise: () =>
        Promise.resolve(
          result("s1", 1, 10, Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join("\n")),
        ),
    });
    await act(async () => {
      renderer = create(view("s1", 1, 11));
    });
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain("–10");
    expect(rendered).not.toContain("–11");
  });

  it("shows a fetch failure instead of substituting a full-file diff", async () => {
    query.mockReturnValue({ toPromise: () => Promise.reject(new Error("Source unavailable")) });
    await act(async () => {
      renderer = create(view("s1"));
    });
    expect(JSON.stringify(renderer.toJSON())).toContain("Source unavailable");
    expect(query).toHaveBeenCalledTimes(1);
  });
});
