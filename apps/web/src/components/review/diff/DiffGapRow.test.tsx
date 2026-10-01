import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { DiffGapRow } from "./DiffGapRow";

describe("DiffGapRow", () => {
  it("renders a collapsed-lines glyph rather than a literal entity", () => {
    let rendered: ReturnType<typeof create>;

    act(() => {
      rendered = create(<DiffGapRow label="34 unchanged lines" position="between" />);
    });

    const text = rendered!.root.findByType("div").children.join("");
    expect(text).toBe("⋯ 34 unchanged lines");
    expect(text).not.toContain("&ctdot;");
  });

  it("lets people expand a collapsed gap", () => {
    const onExpand = vi.fn();
    let rendered: ReturnType<typeof create>;

    act(() => {
      rendered = create(
        <DiffGapRow label="34 unchanged lines" position="between" onExpand={onExpand} />,
      );
    });
    act(() => rendered!.root.findByType("button").props.onClick());

    expect(onExpand).toHaveBeenCalledOnce();
    expect(rendered!.root.findByType("button").props["aria-label"]).toBe(
      "Show 34 unchanged lines",
    );
  });
});
