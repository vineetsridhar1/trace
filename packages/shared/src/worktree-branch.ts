export function generatedTraceWorktreeBranch(slug: string): string {
  return `trace/${slug}`;
}

export function shouldRepairRenamedTraceWorktreeBranch({
  currentBranch,
  requestedBranch,
  persistedBranch,
  preserveBranchName,
}: {
  currentBranch: string | null;
  requestedBranch: string;
  persistedBranch: string | undefined;
  preserveBranchName: boolean | undefined;
}): boolean {
  return (
    preserveBranchName === true &&
    !!currentBranch &&
    !!persistedBranch &&
    currentBranch !== requestedBranch &&
    currentBranch.startsWith("trace/") &&
    requestedBranch === persistedBranch
  );
}
