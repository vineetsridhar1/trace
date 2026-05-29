export interface BranchDiffFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

export type BranchChangesViewMode = "tree" | "flat";
