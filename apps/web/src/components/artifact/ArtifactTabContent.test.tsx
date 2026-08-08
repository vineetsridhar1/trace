import { renderToStaticMarkup } from "react-dom/server";
import type { Artifact, Session, User } from "@trace/gql";
import { describe, expect, it, vi } from "vitest";
import { ArtifactTabContent } from "./ArtifactTabContent";

vi.mock("@trace/client-core", () => ({
  useEntityStore: (
    selector: (state: { artifacts: Record<string, Artifact> }) => Artifact | undefined,
  ) =>
    selector({
      artifacts: {
        "video-1": {
          bundleDigest: "sha256:bundle",
          byteSize: 1024,
          createdAt: "2026-08-08T00:00:00.000Z",
          createdBy: {} as User,
          id: "video-1",
          organizationId: "org-1",
          session: {} as Session,
          sessionId: "session-1",
          type: "trace.video.v1",
          key: "browser-proof",
          manifest: {
            schemaVersion: 1,
            files: [
              {
                path: "browser-proof.webm",
                mediaType: "video/webm",
                size: 1024,
                digest: "sha256:digest",
              },
            ],
          },
        } satisfies Artifact,
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
