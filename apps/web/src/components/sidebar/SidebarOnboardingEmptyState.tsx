import { Code, Search } from "lucide-react";
import { Button } from "../ui/button";

interface SidebarOnboardingEmptyStateProps {
  onBrowseClick: () => void;
  onCreateClick: () => void;
}

export function SidebarOnboardingEmptyState({
  onBrowseClick,
  onCreateClick,
}: SidebarOnboardingEmptyStateProps) {
  return (
    <div className="mx-2 mt-2 rounded-lg border border-dashed border-border bg-surface-deep/60 px-3 py-4 text-center">
      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-surface-elevated text-muted-foreground">
        <Code size={18} />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">Create your first project</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Projects keep chats and coding sessions organized.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <Button size="sm" onClick={onCreateClick} className="w-full">
          Create project
        </Button>
        <Button variant="outline" size="sm" onClick={onBrowseClick} className="w-full gap-1.5">
          <Search size={14} />
          Browse existing
        </Button>
      </div>
    </div>
  );
}
