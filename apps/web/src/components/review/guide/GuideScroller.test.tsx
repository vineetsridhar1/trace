import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewFile } from "@trace/gql";
import { GuideScroller } from "./GuideScroller";
import { GuideChapterAside } from "./GuideChapterAside";
import { GuideFileDiff } from "./GuideFileDiff";
import { normalizeGuideContent } from "./guide-content";

vi.mock("./GuideFileDiff", () => ({ GuideFileDiff: () => null }));
vi.mock("./GuideChapterAside", () => ({ GuideChapterAside: () => null }));

const content = normalizeGuideContent({
  chapters: [
    { id: "one", title: "One", explanation: "Context", files: ["src/a.ts", "src/context.ts"] },
  ],
  everythingElse: ["src/b.ts"],
});
const files = ["src/a.ts", "src/b.ts"].map((path) => ({ path }) as ReviewFile);

describe("Guide reference navigation", () => {
  let renderer: ReactTestRenderer;
  const openSource = vi.fn();
  const openChanges = vi.fn();
  const scrollIntoView = vi.fn();
  const querySelector = vi.fn(() => ({ scrollIntoView }));

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    vi.clearAllMocks();
    act(() => {
      renderer = create(
        <GuideScroller
          snapshotId="snapshot"
          content={content}
          files={files}
          onOpenReference={openSource}
          onOpenInChanges={openChanges}
          onAskAboutChapter={vi.fn()}
          onCommentOnChapter={vi.fn()}
          onReviewAllChanges={vi.fn()}
        />,
        { createNodeMock: () => ({ querySelector }) },
      );
    });
  });

  afterEach(() => {
    act(() => renderer.unmount());
    vi.unstubAllGlobals();
  });

  it("renders only changed files as diffs and keeps context as a source link", () => {
    expect(renderer.root.findAllByType(GuideFileDiff).map((node) => node.props.filePath)).toEqual([
      "src/a.ts",
    ]);
    expect(JSON.stringify(renderer.toJSON())).toContain("Context file");
    const button = renderer.root
      .findAllByType("button")
      .find((node) =>
        node.findAllByType("span").some((span) => span.children.includes("src/context.ts")),
      );
    act(() => button!.props.onClick());
    expect(openSource).toHaveBeenCalledWith({
      filePath: "src/context.ts",
      startLine: 1,
      endLine: 1,
    });
  });

  it("opens a contextual prose anchor at its source range", () => {
    const anchor = { filePath: "src/helper.ts", startLine: 4, endLine: 9 };
    act(() => renderer.root.findByType(GuideChapterAside).props.onAnchor(anchor));
    expect(openSource).toHaveBeenCalledWith(anchor);
    expect(openChanges).not.toHaveBeenCalled();
    expect(querySelector).not.toHaveBeenCalled();
  });

  it("opens unassigned changed files in Changes", () => {
    const anchor = { filePath: "src/b.ts", startLine: 4, endLine: 9 };
    act(() => renderer.root.findByType(GuideChapterAside).props.onAnchor(anchor));
    expect(openChanges).toHaveBeenCalledWith(anchor);
    expect(openSource).not.toHaveBeenCalled();
  });

  it("scrolls to a chapter diff instead of opening external source", () => {
    const anchor = { filePath: "src/a.ts", startLine: 4, endLine: 9 };
    act(() => renderer.root.findByType(GuideChapterAside).props.onAnchor(anchor));
    expect(scrollIntoView).toHaveBeenCalled();
    expect(renderer.root.findByType(GuideFileDiff).props.highlight).toEqual(anchor);
    expect(openSource).not.toHaveBeenCalled();
    expect(openChanges).not.toHaveBeenCalled();
  });
});
