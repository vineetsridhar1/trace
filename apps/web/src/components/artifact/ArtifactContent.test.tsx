import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { Artifact } from "@trace/gql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArtifactContent } from "./ArtifactContent";

vi.mock("@trace/client-core", () => ({
  getAuthHeaders: () => ({ Authorization: "Bearer test-token" }),
}));
vi.mock("../ui/trace-loader", () => ({ TraceLoader: () => <span>Loading</span> }));

const artifact = {
  id: "artifact-1",
  type: "html-bundle",
  key: "mortgages-ai-usage",
  manifest: {
    schemaVersion: 1,
    files: [
      { path: "analysis.json", mediaType: "application/json", size: 10, digest: "sha256:json" },
      { path: "alternate.html", mediaType: "text/html", size: 10, digest: "sha256:alternate" },
      { path: "index.html", mediaType: "text/html", size: 10, digest: "sha256:html" },
      { path: "README.md", mediaType: "text/markdown", size: 10, digest: "sha256:readme" },
    ],
  },
} as Artifact;

describe("ArtifactContent HTML bundles", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("<h1>Mortgage analysis</h1>"));
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    vi.unstubAllGlobals();
  });

  it.each(["html-bundle", "trace.file-bundle.v1"])(
    "opens the root index.html for %s, even when another HTML file comes first",
    async (type) => {
      await act(async () => {
        renderer = create(<ArtifactContent artifact={{ ...artifact, type }} />);
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "/artifacts/artifact-1/files/index.html",
        expect.objectContaining({
          credentials: "include",
          headers: { Authorization: "Bearer test-token" },
          signal: expect.any(AbortSignal),
        }),
      );
      const frame = renderer!.root.findByType("iframe");
      expect(frame.props.srcDoc).toContain("<h1>Mortgage analysis</h1>");
      expect(frame.props.srcDoc).toContain("default-src 'none'");
      expect(frame.props.sandbox).toBe("");
      expect(renderer!.root.findAllByType("div")).toHaveLength(0);
    },
  );

  it("keeps the file list when the bundle has no root index.html", async () => {
    const files = artifact.manifest.files.map((file) =>
      file.path === "index.html" ? { ...file, path: "docs/index.html" } : file,
    );
    await act(async () => {
      renderer = create(
        <ArtifactContent artifact={{ ...artifact, manifest: { schemaVersion: 1, files } }} />,
      );
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(renderer!.root.findAllByType("iframe")).toHaveLength(0);
    expect(JSON.stringify(renderer!.toJSON())).toContain("docs/index.html");
    expect(JSON.stringify(renderer!.toJSON())).toContain("analysis.json");
  });

  it("shows a loading error when index.html cannot be fetched", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
    await act(async () => {
      renderer = create(<ArtifactContent artifact={artifact} />);
    });

    expect(renderer!.root.findByType("p").children).toEqual(["Could not load index.html"]);
    expect(renderer!.root.findAllByType("iframe")).toHaveLength(0);
  });

  it("aborts the old document request when switching artifacts", async () => {
    let resolveFirst!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    await act(async () => {
      renderer = create(<ArtifactContent artifact={artifact} />);
    });
    const firstSignal = fetchMock.mock.calls[0][1]?.signal;
    expect(JSON.stringify(renderer!.toJSON())).toContain("Loading");

    await act(async () => {
      renderer!.update(<ArtifactContent artifact={{ ...artifact, id: "artifact-2" }} />);
    });
    expect(firstSignal?.aborted).toBe(true);

    await act(async () => {
      resolveFirst(new Response("<h1>Stale document</h1>"));
    });
    const frame = renderer!.root.findByType("iframe");
    expect(frame.props.srcDoc).toContain("Mortgage analysis");
    expect(frame.props.srcDoc).not.toContain("Stale document");
  });
});
