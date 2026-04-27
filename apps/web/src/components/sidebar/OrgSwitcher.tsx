import { ChevronDown, Check, Plus } from "lucide-react";
import { useAuthStore, type OrgMembership } from "@trace/client-core";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { getInitials } from "../../lib/utils";
import { CreateOrganizationDialog } from "./CreateOrganizationDialog";

export function OrgSwitcher({ large }: { large?: boolean }) {
  const orgMemberships = useAuthStore((s: { orgMemberships: OrgMembership[] }) => s.orgMemberships);
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const setActiveOrg = useAuthStore((s: { setActiveOrg: (orgId: string) => void }) => s.setActiveOrg);

  const activeOrg = orgMemberships.find((m: OrgMembership) => m.organizationId === activeOrgId)?.organization;
  const orgList = orgMemberships.map((m: OrgMembership) => m.organization);
  const triggerClassName = `flex h-full w-full cursor-pointer items-center gap-2 px-3 transition-colors hover:bg-surface-elevated ${large ? "py-2.5" : ""}`;

  return (
    <Popover>
      <PopoverTrigger
        className={triggerClassName}
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
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="!w-64 gap-0 overflow-hidden rounded-lg border border-border bg-surface-elevated p-1.5 shadow-lg"
      >
        <div className="px-2.5 pb-1.5 pt-1">
          <p className="text-[11px] font-medium uppercase text-muted-foreground">
            Organizations
          </p>
        </div>
        {orgList.map((org: { id: string; name: string }) => (
          <button
            key={org.id}
            onClick={() => setActiveOrg(org.id)}
            className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-surface-hover ${
              org.id === activeOrgId ? "bg-surface-hover text-foreground" : "text-muted-foreground"
            }`}
          >
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold ${
                org.id === activeOrgId
                  ? "bg-accent text-accent-foreground"
                  : "bg-surface-deep text-muted-foreground"
              }`}
            >
              {getInitials(org.name)}
            </div>
            <span className="flex-1 truncate text-left font-medium">{org.name}</span>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center">
              {org.id === activeOrgId ? <Check size={14} className="text-accent" /> : null}
            </span>
          </button>
        ))}
        <div className="mx-2 my-1.5 h-px bg-border" />
        <CreateOrganizationDialog
          trigger={
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-deep text-muted-foreground">
                <Plus size={13} />
              </div>
              <span className="flex-1 truncate text-left font-medium">Create organization</span>
              <span className="h-5 w-5 shrink-0" />
            </button>
          }
        />
      </PopoverContent>
    </Popover>
  );
}
