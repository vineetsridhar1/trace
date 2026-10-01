import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuideCodeExcerpt } from "./GuideCodeExcerpt";

const query = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/urql", () => ({ client: { query } }));

function view(snapshotId: string, startLine = 10, endLine = 11) {
  return (
    <GuideCodeExcerpt
      snapshotId={snapshotId}
      filePath="src/a.ts"
      startLine={startLine}
      endLine={endLine}
      title="Validate"
      explanation="Validation precedes writes."
      step={1}
      active
      inChanges
      onOpen={() => {}}
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
    query.mockReset();
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    vi.unstubAllGlobals();
  });

  it("requests only the named range and displays its explanation and code", async () => {
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
    expect(rendered).toContain("Validation precedes writes.");
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

  it("shows a fetch failure instead of substituting a full-file diff", async () => {
    query.mockReturnValue({ toPromise: () => Promise.reject(new Error("Source unavailable")) });
    await act(async () => {
      renderer = create(view("s1"));
    });
    expect(JSON.stringify(renderer.toJSON())).toContain("Source unavailable");
    expect(query).toHaveBeenCalledTimes(1);
  });
});
