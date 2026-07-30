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

  it("renders the visual block shapes produced by the bundled skill", () => {
    const html = renderToStaticMarkup(
      createElement(PlanMdx, {
        content: `
<Diagram frame="hide" html={'<div><strong>Architecture</strong></div>'} />

<AnnotatedCode language="ts" code={"const score = 3;"} annotations={[{"lines":"1","label":"Score","note":"Award once."}]} />

<DesignBoard>
  <Section title="Scoring flow">
    <Artboard id="score" title="Scoreboard">
      <Screen surface="browser" frame="show" html={'<div><strong>Alex 3</strong></div>'} />
    </Artboard>
    <Annotation targetId="score" placement="right" title="Award">Update once.</Annotation>
  </Section>
</DesignBoard>

<QuestionForm title="Open Questions" questions={[{"id":"turns","title":"How many turns?","mode":"single","options":[{"id":"five","label":"Five","recommended":true}]}]} />`,
        steerable: false,
      }),
    );

    expect(html).toContain("Score");
    expect(html).toContain("DesignBoard");
    expect(html).toContain("How many turns?");
  });
});
