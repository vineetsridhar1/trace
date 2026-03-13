import { Plus } from "lucide-react";
import { useEntityStore } from "../stores/entity";
import { useAuthStore } from "../stores/auth";

function getInitials(name: string): string {
  return name
    .split(/[\s']+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function ServerIcon({
  name,
  isActive,
  onClick,
}: {
  name: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={name}
      className={`flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-semibold transition-colors duration-150 ${
        isActive
          ? "bg-accent text-accent-foreground"
          : "bg-surface-elevated text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      {getInitials(name)}
    </button>
  );
}

export function ServerSidebar() {
  const organizations = useEntityStore((s) => s.organizations);
  const user = useAuthStore((s) => s.user);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const setActiveOrg = useAuthStore((s) => s.setActiveOrg);

  const orgList = Object.values(organizations);

  return (
    <div className="flex h-full w-[72px] flex-col items-center gap-2 bg-surface-deep py-3">
      {/* Organization list */}
      <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto">
        {orgList.map((org) => (
          <ServerIcon
            key={org.id}
            name={org.name}
            isActive={org.id === activeOrgId}
            onClick={() => setActiveOrg(org.id)}
          />
        ))}

        {/* Separator */}
        <div className="mx-auto my-1 h-px w-8 bg-border" />

        {/* Add server button */}
        <button
          title="Add a server"
          className="flex h-12 w-12 items-center justify-center rounded-3xl bg-surface-elevated text-green-500 transition-all duration-200 hover:rounded-2xl hover:bg-green-500 hover:text-white"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* User avatar at bottom */}
      <div className="mt-auto pt-2">
        <div className="mx-auto mb-2 h-px w-8 bg-border" />
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.name} className="h-10 w-10 rounded-full" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-elevated text-xs font-semibold text-muted-foreground">
            {getInitials(user?.name ?? "")}
          </div>
        )}
      </div>
    </div>
  );
}
