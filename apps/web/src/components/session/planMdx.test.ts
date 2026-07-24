import { describe, expect, it } from "vitest";
import { parsePlanDiagram, parsePlanMdx } from "./planMdxParser";

describe("plan MDX parser", () => {
  it("separates prose and allowlisted visual blocks", () => {
    const nodes = parsePlanMdx(`# Plan

Overview.

<Callout title="Boundary" tone="decision">
The service owns it.
</Callout>

## Steps

<Checklist title="Verification">
- [ ] Run the test
</Checklist>`);

    expect(nodes).toHaveLength(4);
    expect(nodes[1]).toMatchObject({
      type: "block",
      name: "Callout",
      title: "Boundary",
      tone: "decision",
      content: "The service owns it.",
    });
    expect(nodes[3]).toMatchObject({
      type: "block",
      name: "Checklist",
      title: "Verification",
    });
  });

  it("parses diagram relationships", () => {
    expect(parsePlanDiagram("Web -> Service: request\nService -> Store: append event")).toEqual([
      { source: "Web", target: "Service", label: "request" },
      { source: "Service", target: "Store", label: "append event" },
    ]);
  });
});
