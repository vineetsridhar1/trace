import { ChevronDown, Check } from "lucide-react";
import { useAuthStore, type OrgMembership } from "../../stores/auth";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { getInitials } from "../../lib/utils";

export function OrgSwitcher({ large }: { large?: boolean }) {
  const orgMemberships = useAuthStore((s: { orgMemberships: OrgMembership[] }) => s.orgMemberships);
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const setActiveOrg = useAuthStore((s: { setActiveOrg: (orgId: string) => void }) => s.setActiveOrg);

  const activeOrg = orgMemberships.find((m: OrgMembership) => m.organizationId === activeOrgId)?.organization;
  const orgList = orgMemberships.map((m: OrgMembership) => m.organization);

  return (
    <Popover>
      <PopoverTrigger
        className={`flex h-full w-full cursor-pointer items-center gap-2 px-3 transition-colors hover:bg-surface-elevated ${large ? "py-2.5" : ""}`}
      >
        <div
          className={`flex shrink-0 items-center justify-center rounded-lg bg-accent font-bold text-accent-foreground ${large ? "h-7.5 w-7.5 text-xs" : "h-7 w-7 text-xs"}`}
        >
          {getInitials(activeOrg?.name ?? "")}
        </div>
        <span
          className={`flex-1 truncate text-left font-semibold text-foreground ${large ? "text-[15px]" : "text-sm"}`}
        >
          {activeOrg?.name ?? "Workspace"}
        </span>
        <ChevronDown size={large ? 15 : 14} className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="center" sideOffset={4} className="!w-56 gap-0 p-1.5">
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Switch server</p>
        {orgList.map((org: { id: string; name: string }) => (
          <button
            key={org.id}
            onClick={() => setActiveOrg(org.id)}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-surface-hover"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-elevated text-[10px] font-semibold text-muted-foreground">
              {getInitials(org.name)}
            </div>
            <span className="flex-1 truncate">{org.name}</span>
            {org.id === activeOrgId && <Check size={14} className="text-accent" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
