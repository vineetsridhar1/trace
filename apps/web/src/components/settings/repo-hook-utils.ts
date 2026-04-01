export function getHookStatusTone(
  linkedPath: string | null,
  gitHooksEnabled: boolean,
  status: DesktopRepoGitHookStatus | null,
): string {
  if (!linkedPath) return "text-muted-foreground";
  if (!gitHooksEnabled) return "text-muted-foreground";
  if (!status) return "text-muted-foreground";

  switch (status.state) {
    case "trace_managed":
    case "chained":
      return "text-emerald-500";
    case "custom_present":
      return "text-amber-500";
    case "error":
    case "not_installed":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

export function getHookStatusLabel(
  linkedPath: string | null,
  gitHooksEnabled: boolean,
  status: DesktopRepoGitHookStatus | null,
): string {
  if (!linkedPath) return "Not linked on this desktop";
  if (!gitHooksEnabled) {
    if (status?.state === "custom_present") {
      return "Custom git hooks present";
    }
    return "Git hooks disabled";
  }
  if (!status) return "Checking git hooks...";

  switch (status.state) {
    case "trace_managed":
      return "Trace hooks installed";
    case "chained":
      return "Trace hooks chained with existing hooks";
    case "custom_present":
      return "Custom hooks detected";
    case "not_installed":
      return "Trace hooks missing";
    case "error":
      return "Trace hooks need repair";
    default:
      return "Checking git hooks...";
  }
}

export function getHookStatusDetail(
  gitHooksEnabled: boolean,
  status: DesktopRepoGitHookStatus | null,
): string | null {
  if (!status) return null;

  if (!gitHooksEnabled && status.state === "custom_present") {
    return "Enabling Trace hooks will preserve and chain your existing Git hooks.";
  }

  if (status.state === "chained") {
    return "Existing custom Git hooks are preserved and run before Trace's hook runner.";
  }

  if (status.state === "error") {
    const errors = status.hooks
      .filter((hook) => hook.error)
      .map((hook) => `${hook.hookName}: ${hook.error}`)
      .join(" ");
    return errors || "The installed hook wrapper is missing its runner or chained hook.";
  }

  if (status.state === "not_installed") {
    const missingHooks = status.hooks
      .filter((hook) => hook.state === "not_installed")
      .map((hook) => hook.hookName)
      .join(", ");
    return missingHooks ? `Missing hooks: ${missingHooks}.` : null;
  }

  return null;
}
