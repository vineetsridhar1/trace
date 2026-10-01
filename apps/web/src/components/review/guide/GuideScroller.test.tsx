import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewFile } from "@trace/gql";
import { GuideScroller } from "./GuideScroller";
import { GuideChapterAside } from "./GuideChapterAside";
import { GuideCodeExcerpt } from "./GuideCodeExcerpt";
import { normalizeGuideContent } from "./guide-content";

vi.mock("./GuideCodeExcerpt", () => ({ GuideCodeExcerpt: () => null }));
vi.mock("./GuideChapterAside", () => ({ GuideChapterAside: () => null }));

const content = normalizeGuideContent({
  chapters: [
    {
      id: "one",
      title: "One",
      explanation: "Context",
      references: [
        {
          filePath: "src/a.ts",
          startLine: 4,
          endLine: 9,
          title: "Validate",
          explanation: "Validate before writing",
        },
        {
          filePath: "src/context.ts",
          startLine: 8,
          endLine: 12,
          title: "Persist",
          explanation: "Store the result",
        },
      ],
    },
    {
      id: "two",
      title: "Two",
      explanation: "Same file, separate behavior",
      references: [
        {
          filePath: "src/a.ts",
          startLine: 40,
          endLine: 49,
          title: "Notify",
          explanation: "Notify subscribers",
        },
      ],
    },
  ],
  everythingElse: ["src/b.ts"],
});
const files = ["src/a.ts", "src/b.ts"].map((path) => ({ path }) as ReviewFile);

describe("Guide reference navigation", () => {
  let renderer: ReactTestRenderer;
  const openSource = vi.fn();
  const openChanges = vi.fn();
  const scrollIntoView = vi.fn();
  const querySelector = vi.fn((_selector: string) => ({ scrollIntoView }));

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
          onRegenerate={vi.fn()}
        />,
        { createNodeMock: () => ({ querySelector }) },
      );
    });
  });

  afterEach(() => {
    act(() => renderer.unmount());
    vi.unstubAllGlobals();
  });

  it("renders ordered precise excerpts, including context and repeated files", () => {
    const cards = renderer.root.findAllByType(GuideCodeExcerpt);
    expect(
      cards.map((card) => [card.props.filePath, card.props.startLine, card.props.endLine]),
    ).toEqual([
      ["src/a.ts", 4, 9],
      ["src/context.ts", 8, 12],
      ["src/a.ts", 40, 49],
    ]);
    act(() => cards[1]!.props.onOpen());
    expect(openSource).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: "src/context.ts", startLine: 8, endLine: 12 }),
    );
  });

  it("targets the current chapter when the same file occurs more than once", () => {
    const anchor = { filePath: "src/a.ts", startLine: 40, endLine: 49 };
    act(() => renderer.root.findAllByType(GuideChapterAside)[1]!.props.onAnchor(anchor));
    expect(querySelector.mock.calls[0]?.[0]).toContain('[data-guide-chapter="1"]');
    expect(renderer.root.findAllByType(GuideCodeExcerpt).map((card) => card.props.active)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("opens a contextual prose anchor at its source range", () => {
    const anchor = { filePath: "src/helper.ts", startLine: 4, endLine: 9 };
    act(() => renderer.root.findAllByType(GuideChapterAside)[0]!.props.onAnchor(anchor));
    expect(openSource).toHaveBeenCalledWith(anchor);
    expect(openChanges).not.toHaveBeenCalled();
    expect(querySelector).not.toHaveBeenCalled();
  });

  it("opens unassigned changed files in Changes", () => {
    const anchor = { filePath: "src/b.ts", startLine: 4, endLine: 9 };
    act(() => renderer.root.findAllByType(GuideChapterAside)[0]!.props.onAnchor(anchor));
    expect(openChanges).toHaveBeenCalledWith(anchor);
    expect(openSource).not.toHaveBeenCalled();
  });

  it("scrolls to a chapter diff instead of opening external source", () => {
    const anchor = { filePath: "src/a.ts", startLine: 4, endLine: 9 };
    act(() => renderer.root.findAllByType(GuideChapterAside)[0]!.props.onAnchor(anchor));
    expect(scrollIntoView).toHaveBeenCalled();
    expect(renderer.root.findAllByType(GuideCodeExcerpt)[0]!.props.active).toBe(true);
    expect(openSource).not.toHaveBeenCalled();
    expect(openChanges).not.toHaveBeenCalled();
  });
});
