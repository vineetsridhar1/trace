import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanMdx } from "./PlanMdx";
import { parsePlanMdx } from "./planMdxParser";

describe("Agent-Native plan MDX parser", () => {
  it("parses upstream rich text and registry blocks", () => {
    const nodes = parsePlanMdx(`---
title: "Session recovery"
version: 2
---

<RichText id="intro">

## Outcome

Sessions resume from a durable checkpoint.

</RichText>

<Callout id="boundary" tone="decision">

The service owns checkpoint selection.

</Callout>

<Checklist
  id="verification"
  items={[
    { id: "unit", label: "Run unit tests", checked: true },
    { id: "e2e", label: "Resume a stopped session", checked: false },
  ]}
/>`);

    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toMatchObject({
      type: "markdown",
      content: "## Outcome\n\nSessions resume from a durable checkpoint.",
    });
    expect(nodes[1]).toMatchObject({
      type: "registry-block",
      id: "boundary",
      blockType: "callout",
      data: {
        tone: "decision",
        body: "The service owns checkpoint selection.",
      },
    });
    expect(nodes[2]).toMatchObject({
      type: "registry-block",
      id: "verification",
      blockType: "checklist",
      data: {
        items: [
          { id: "unit", label: "Run unit tests", checked: true },
          { id: "e2e", label: "Resume a stopped session", checked: false },
        ],
      },
    });
  });

  it("keeps unregistered upstream blocks reviewable", () => {
    expect(
      parsePlanMdx('<Decision id="choice" title="Choose storage" options={[]} />'),
    ).toMatchObject([
      {
        type: "unknown-block",
        id: "choice",
        name: "Decision",
      },
    ]);
  });

  it("renders an upstream checklist with the first-party block renderer", () => {
    const html = renderToStaticMarkup(
      createElement(PlanMdx, {
        content:
          '<Checklist id="checks" items={[{ id: "unit", label: "Run unit tests", checked: true }]} />',
        steerable: false,
      }),
    );

    expect(html).toContain("Run unit tests");
  });
});
