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

export function branchNameFromGitRef(ref: string): string | null {
  const trimmed = ref.trim();
  if (trimmed.startsWith("refs/heads/")) return trimmed.slice("refs/heads/".length);
  if (!trimmed.startsWith("refs/remotes/")) return null;

  const remoteBranch = trimmed.slice("refs/remotes/".length);
  const separatorIndex = remoteBranch.indexOf("/");
  if (separatorIndex === -1) return null;

  const branch = remoteBranch.slice(separatorIndex + 1);
  return branch === "HEAD" ? null : branch;
}

export function branchNamesFromGitRefsOutput(output: string): string[] {
  return output
    .split("\n")
    .map(branchNameFromGitRef)
    .filter((branch): branch is string => !!branch);
}

export function resolveGeneratedTraceWorktreeBranch(
  slug: string,
  refs: Iterable<string>,
  now: () => number = Date.now,
): string {
  const generatedBranch = generatedTraceWorktreeBranch(slug);
  if (!hasGitRefNamespaceConflict(generatedBranch, refs)) return generatedBranch;

  for (let i = 2; i <= 999; i++) {
    const candidate = `${generatedBranch}-${i}`;
    if (!hasGitRefNamespaceConflict(candidate, refs)) return candidate;
  }

  return `${generatedBranch}-${now()}`;
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
