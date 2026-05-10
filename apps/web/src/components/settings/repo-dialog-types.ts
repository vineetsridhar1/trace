export interface DetectedRepo {
  name: string;
  remoteUrl: string | null;
  defaultBranch: string;
}

export type RepoDialogMode = "link" | "create";

export interface ProjectParentSelection {
  token: string;
  path: string;
}
