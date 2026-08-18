import { useEntityField } from "@trace/client-core";

export function RepoName({ repoId }: { repoId: string }) {
  const name = useEntityField("repos", repoId, "name");
  return <>{name ?? repoId}</>;
}
