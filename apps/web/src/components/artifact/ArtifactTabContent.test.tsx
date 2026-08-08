import { renderToStaticMarkup } from "react-dom/server";
import type { Artifact } from "@trace/gql";
import { describe, expect, it, vi } from "vitest";
import { ArtifactTabContent } from "./ArtifactTabContent";

vi.mock("@trace/client-core", () => ({
  useEntityStore: (
    selector: (state: { artifacts: Record<string, Artifact> }) => Artifact | undefined,
  ) =>
    selector({
      artifacts: {
        "video-1": {
          id: "video-1",
          type: "trace.video.v1",
          key: "browser-proof",
          manifest: {
            schemaVersion: 1,
            files: [
              {
                path: "browser-proof.webm",
                mediaType: "video/webm",
                size: 1024,
                sha256: "digest",
              },
            ],
          },
        } as unknown as Artifact,
      },
    }),
}));

describe("ArtifactTabContent", () => {
  it("renders a video artifact with the media renderer instead of the plan renderer", () => {
    const markup = renderToStaticMarkup(<ArtifactTabContent artifactId="video-1" />);

    expect(markup).toContain("<video");
    expect(markup).toContain("browser-proof.webm");
    expect(markup).not.toContain("Visual plan artifact has no HTML file");
  });
});
