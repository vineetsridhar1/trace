import { Plus, Settings, LogOut } from "lucide-react";
import { motion } from "framer-motion";
import { useEntityStore } from "../stores/entity";
import { useAuthStore } from "../stores/auth";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";

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

function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <Popover>
      <PopoverTrigger>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="relative cursor-pointer overflow-hidden rounded-full ring-2 ring-transparent transition-[box-shadow] duration-150 hover:ring-accent"
        >
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="h-10 w-10 rounded-full"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-elevated text-xs font-semibold text-muted-foreground">
              {getInitials(user?.name ?? "")}
            </div>
          )}
        </motion.button>
      </PopoverTrigger>
      <PopoverContent side="right" sideOffset={12} align="end" className="w-56 p-1.5">
        <div className="px-2 py-1.5 border-b border-border mb-1">
          <p className="text-sm font-medium text-foreground">{user?.name}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <button
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-surface-hover"
        >
          <Settings size={16} className="text-muted-foreground" />
          Settings
        </button>
        <button
          onClick={logout}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive transition-colors hover:bg-surface-hover"
        >
          <LogOut size={16} />
          Log out
        </button>
      </PopoverContent>
    </Popover>
  );
}

export function ServerSidebar() {
  const organizations = useEntityStore((s) => s.organizations);
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

      {/* User menu at bottom */}
      <div className="mt-auto pt-2">
        <div className="mx-auto mb-2 h-px w-8 bg-border" />
        <UserMenu />
      </div>
    </div>
  );
}
