import type { Artifact } from "@trace/gql";
import { MediaArtifact } from "./MediaArtifact";

export function ArtifactContent({ artifact }: { artifact: Artifact }) {
  if (artifact.type === "trace.image.v1" || artifact.type === "trace.video.v1") {
    return <MediaArtifact artifact={artifact} />;
  }
  return (
    <div className="space-y-2 p-5">
      {artifact.manifest.files.map((file) => (
        <div key={file.path} className="rounded-md border border-border px-3 py-2 text-sm">
          {file.path}
        </div>
      ))}
    </div>
  );
}
