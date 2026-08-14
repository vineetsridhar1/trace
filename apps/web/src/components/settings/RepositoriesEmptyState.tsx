import { GitBranch, Info } from "lucide-react";
import { CreateRepoDialog } from "./CreateRepoDialog";
import { canCreateLocalProject } from "./useCreateRepoDialog";

const STEPS = [
  {
    title: "Connect a repository",
    description: "Paste a GitHub URL, or add a local project from the desktop app.",
  },
  {
    title: "Set the default branch",
    description: "Sessions branch from it and open pull requests against it.",
  },
  {
    title: "Add automation",
    description: "A setup script plus run scripts make every session ready to work.",
  },
] as const;

export function RepositoriesEmptyState({ onCreated }: { onCreated: () => void }) {
  return (
    <>
      <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-8 py-12 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
          <GitBranch size={18} />
        </span>
        <h3 className="mt-4 text-sm font-semibold text-foreground">No repositories yet</h3>
        <p className="mt-1 max-w-sm text-[13px] leading-5 text-muted-foreground">
          Connect the codebase your team works in. Agents and members start every coding session
          from a repository.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <CreateRepoDialog
            triggerLabel="Connect repository"
            triggerVariant="default"
            onCreated={onCreated}
          />
          {canCreateLocalProject ? (
            <CreateRepoDialog
              initialMode="create"
              triggerLabel="Add local project"
              triggerVariant="outline"
              onCreated={onCreated}
            />
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {STEPS.map((step, index) => (
          <div key={step.title} className="rounded-xl border border-border bg-surface-deep p-4">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-[11px] font-semibold text-muted-foreground">
              {index + 1}
            </span>
            <p className="mt-3 text-[13px] font-medium text-foreground">{step.title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.description}</p>
          </div>
        ))}
      </div>

      <p className="mt-5 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
        <Info size={13} className="mt-0.5 shrink-0" />
        Cloud sessions need a GitHub token or SSH key — add yours under API keys, or share one with
        the workspace under Secrets.
      </p>
    </>
  );
}
