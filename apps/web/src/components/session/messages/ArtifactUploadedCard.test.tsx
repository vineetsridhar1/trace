import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArtifactUploadedCard } from "./ArtifactUploadedCard";
import { ArtifactOpenContext } from "../../artifact/ArtifactOpenContext";

describe("ArtifactUploadedCard", () => {
  it("renders the rich HTML artifact preview and in-app open action", () => {
    const markup = renderToStaticMarkup(
      <ArtifactOpenContext.Provider value={() => {}}>
        <ArtifactUploadedCard
          artifactId="artifact / one"
          artifactType="trace.visual-plan.v1"
          timestamp="2026-08-01T12:00:00.000Z"
        />
      </ArtifactOpenContext.Provider>,
    );

    expect(markup).toContain("Interactive preview");
    expect(markup).toContain("HTML artifact");
    expect(markup).toContain("Implementation plan");
    expect(markup).toContain("<button");
    expect(markup).toContain("Open artifact");
    expect(markup).not.toContain('target="_blank"');
  });
});
