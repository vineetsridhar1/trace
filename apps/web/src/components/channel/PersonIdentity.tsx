import { GitBranch } from "lucide-react";
import { isSyntheticGitHubEmail } from "../../lib/person-identity";
import { cn } from "../../lib/utils";

/** Identity line under a person's name: their email, or a GitHub label when the account has no real address. */
export function PersonIdentity({ email, className }: { email: string; className?: string }) {
  if (!isSyntheticGitHubEmail(email)) {
    return <p className={cn("truncate text-xs text-muted-foreground", className)}>{email}</p>;
  }

  return (
    <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <GitBranch size={11} className="shrink-0 text-muted-foreground/70" />
      <span>GitHub account</span>
    </p>
  );
}
