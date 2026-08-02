import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArtifactUploadedCard } from "./ArtifactUploadedCard";

describe("ArtifactUploadedCard", () => {
  it("links visual plans to the standalone viewer in a new tab", () => {
    const markup = renderToStaticMarkup(
      <ArtifactUploadedCard artifactId="artifact / one" timestamp="2026-08-01T12:00:00.000Z" />,
    );

    expect(markup).toContain("Artifact uploaded");
    expect(markup).toContain("Implementation plan");
    expect(markup).toContain('href="/plans/artifact%20%2F%20one"');
    expect(markup).toContain('target="_blank"');
  });
});
