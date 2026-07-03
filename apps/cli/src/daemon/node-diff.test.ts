import { describe, expect, it } from "vitest";
import { diffNodes } from "./node-diff.js";
import type { ProtocolNode } from "./protocol-nodes.js";

const prompt = (id: string, text: string, optimistic = false): ProtocolNode => ({
  id,
  kind: "user_prompt",
  text,
  timestamp: "2026-07-03T12:00:00.000Z",
  optimistic,
});

const readGroup = (id: string, files: string[]): ProtocolNode => ({
  id,
  kind: "read_group",
  items: files.map((filePath) => ({ toolName: "Read", filePath })),
  timestamp: "2026-07-03T12:00:01.000Z",
});

describe("diffNodes", () => {
  it("returns null when nothing changed", () => {
    const nodes = [prompt("a", "hi")];
    expect(diffNodes(nodes, [...nodes])).toBeNull();
  });

  it("appends new nodes", () => {
    const delta = diffNodes([prompt("a", "hi")], [prompt("a", "hi"), prompt("b", "more")]);
    expect(delta).toEqual({ patched: [], appended: [prompt("b", "more")], count: 2 });
  });

  it("patches a node that grew in place (streaming read group)", () => {
    const delta = diffNodes(
      [prompt("a", "hi"), readGroup("g", ["a.ts"])],
      [prompt("a", "hi"), readGroup("g", ["a.ts", "b.ts"])],
    );
    expect(delta).toEqual({
      patched: [{ index: 1, node: readGroup("g", ["a.ts", "b.ts"]) }],
      appended: [],
      count: 2,
    });
  });

  it("patches optimistic reconciliation in place, no duplicates", () => {
    const delta = diffNodes(
      [prompt("optimistic:tmp", "run tests", true)],
      [prompt("evt-real", "run tests", false)],
    );
    expect(delta).toEqual({
      patched: [{ index: 0, node: prompt("evt-real", "run tests", false) }],
      appended: [],
      count: 1,
    });
  });

  it("truncates when nodes disappear (optimistic rollback)", () => {
    const delta = diffNodes(
      [prompt("a", "hi"), prompt("optimistic:x", "failed", true)],
      [prompt("a", "hi")],
    );
    expect(delta).toEqual({ patched: [], appended: [], truncateFrom: 1, count: 1 });
  });
});
