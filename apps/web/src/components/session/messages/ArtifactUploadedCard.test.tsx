import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArtifactUploadedCard } from "./ArtifactUploadedCard";

describe("ArtifactUploadedCard", () => {
  it("renders an in-app View action for the uploaded plan", () => {
    const markup = renderToStaticMarkup(
      <ArtifactUploadedCard artifactId="artifact / one" timestamp="2026-08-01T12:00:00.000Z" />,
    );

    expect(markup).toContain("Artifact uploaded");
    expect(markup).toContain("Implementation plan");
    expect(markup).toContain("<button");
    expect(markup).toContain(">View</button>");
    expect(markup).not.toContain('target="_blank"');
  });
});
