import { ChevronDown, Check, Plus } from "lucide-react";
import { useAuthStore, type OrgMembership } from "@trace/client-core";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { getInitials } from "../../lib/utils";
import { CreateOrganizationDialog } from "./CreateOrganizationDialog";
import { switchActiveOrganization } from "../../lib/org-switch";

export function OrgSwitcher({ compact, large }: { compact?: boolean; large?: boolean }) {
  const orgMemberships = useAuthStore((s: { orgMemberships: OrgMembership[] }) => s.orgMemberships);
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);

  const activeOrg = orgMemberships.find(
    (m: OrgMembership) => m.organizationId === activeOrgId,
  )?.organization;
  const orgList = orgMemberships.map((m: OrgMembership) => m.organization);
  const triggerClassName = compact
    ? "flex h-7 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm transition-colors hover:bg-white/10"
    : `flex h-full w-full cursor-pointer items-center gap-2 px-3 transition-colors hover:bg-white/10 ${large ? "py-2.5" : ""}`;
  const avatarClassName = compact
    ? "h-5 w-5 rounded-md text-[9px]"
    : `${large ? "h-7.5 w-7.5 text-xs" : "h-7 w-7 text-xs"} rounded-lg`;
  const chevronSize = compact ? 12 : large ? 15 : 14;

  return (
    <Popover>
      <PopoverTrigger className={triggerClassName}>
        <div
          className={`flex shrink-0 items-center justify-center bg-accent font-bold text-accent-foreground ${avatarClassName}`}
        >
          {getInitials(activeOrg?.name ?? "")}
        </div>
        <span
          className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-foreground"
        >
          {activeOrg?.name ?? "Workspace"}
        </span>
        <ChevronDown size={chevronSize} className="shrink-0 text-foreground" />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="!w-64 gap-0 overflow-hidden rounded-lg border border-border bg-surface-elevated p-1.5 shadow-lg"
      >
        <div className="px-2.5 pb-1.5 pt-1">
          <p className="text-[11px] font-medium uppercase text-foreground">Organizations</p>
        </div>
        {orgList.map((org: { id: string; name: string }) => (
          <button
            key={org.id}
            onClick={() => switchActiveOrganization(org.id)}
            className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-white/10 ${
              org.id === activeOrgId ? "bg-white/10 text-foreground" : "text-foreground"
            }`}
          >
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold ${
                org.id === activeOrgId
                  ? "bg-accent text-accent-foreground"
                  : "bg-surface-deep text-foreground"
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
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-white/10"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-deep text-foreground">
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
