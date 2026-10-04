import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArtifactUploadedCard } from "./ArtifactUploadedCard";
import { ArtifactOpenContext } from "../../artifact/ArtifactOpenContext";

describe("ArtifactUploadedCard", () => {
  it("renders the uploaded plan preview and in-app open action", () => {
    const markup = renderToStaticMarkup(
      <ArtifactOpenContext.Provider value={() => {}}>
        <ArtifactUploadedCard
          artifactId="artifact / one"
          artifactType="trace.visual-plan.v1"
          timestamp="2026-08-01T12:00:00.000Z"
        />
      </ArtifactOpenContext.Provider>,
    );

    expect(markup).toContain(">Plan<");
    expect(markup).toContain("Implementation plan");
    expect(markup).toContain("<button");
    expect(markup).toContain("Open plan");
    expect(markup).not.toContain("HTML artifact");
    expect(markup).not.toContain("Interactive preview");
    expect(markup).not.toContain('target="_blank"');
  });

  it("renders an explicit upload card for a generic artifact", () => {
    const markup = renderToStaticMarkup(
      <ArtifactOpenContext.Provider value={() => {}}>
        <ArtifactUploadedCard
          artifactId="artifact-pdf"
          artifactType="mobile-pdf-preview"
          filePath="mobile-preview.pdf"
          mediaType="application/pdf"
          byteSize={1744}
          timestamp="2026-08-01T12:00:00.000Z"
        />
      </ArtifactOpenContext.Provider>,
    );

    expect(markup).toContain("Artifact uploaded");
    expect(markup).toContain("mobile-preview.pdf");
    expect(markup).toContain("PDF");
    expect(markup).toContain("Open artifact");
  });
});
