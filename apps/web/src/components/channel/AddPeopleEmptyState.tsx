import { ExternalLink, Users } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { Button } from "../ui/button";

/**
 * Search dead end. Projects draw only from the workspace roster, so this says
 * why there is no match and routes to the workspace invite instead of stopping.
 */
export function AddPeopleEmptyState({ query, orgName }: { query: string; orgName: string }) {
  const setActivePage = useUIStore((s) => s.setActivePage);
  const setSettingsInitialTab = useUIStore((s) => s.setSettingsInitialTab);

  function openWorkspaceMembers() {
    setSettingsInitialTab("members");
    setActivePage("settings");
  }

  return (
    <div className="mt-3 flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
        <Users size={18} />
      </span>
      <p className="mt-3.5 text-[13px] font-semibold text-foreground">
        Nobody in this workspace matches “{query}”
      </p>
      <p className="mt-1 max-w-[340px] text-xs leading-5 text-muted-foreground">
        Projects draw from {orgName} members. Invite them to the workspace first, then add them
        here.
      </p>
      <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={openWorkspaceMembers}>
        <ExternalLink size={14} />
        Invite to workspace
      </Button>
    </div>
  );
}
