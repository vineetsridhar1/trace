export function generatedTraceWorktreeBranch(slug: string): string {
  return `trace-${slug}`;
}

export function isTraceWorktreeBranch(branch: string): boolean {
  return branch.startsWith("trace/") || branch.startsWith("trace-");
}

export function hasGitRefNamespaceConflict(candidate: string, refs: Iterable<string>): boolean {
  for (const ref of refs) {
    if (ref === candidate) continue;
    if (ref.startsWith(`${candidate}/`) || candidate.startsWith(`${ref}/`)) {
      return true;
    }
  }
  return false;
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
    isTraceWorktreeBranch(currentBranch) &&
    requestedBranch === persistedBranch
  );
}
