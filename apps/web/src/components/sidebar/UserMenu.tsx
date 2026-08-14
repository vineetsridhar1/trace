import { Settings, LogOut } from "lucide-react";
import { motion } from "framer-motion";
import { useAuthStore } from "@trace/client-core";
import { useUIStore } from "../../stores/ui";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { getInitials } from "../../lib/utils";

export function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setActivePage = useUIStore((s) => s.setActivePage);

  return (
    <div className="flex items-stretch overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.04]">
      <Popover>
        <PopoverTrigger className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-2.5 py-2 transition-colors hover:bg-white/[0.07]">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="relative shrink-0 overflow-hidden rounded-full"
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="h-7 w-7 rounded-full" />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-elevated text-[10px] font-semibold text-foreground ring-1 ring-white/[0.08]">
                {getInitials(user?.name ?? "")}
              </div>
            )}
          </motion.div>
          <span className="flex-1 truncate text-left text-sm text-foreground">{user?.name}</span>
        </PopoverTrigger>
        <PopoverContent side="top" align="center" sideOffset={4} className="w-64 gap-0 p-1.5">
          <div className="mb-1 min-w-0 border-b border-border px-2 py-1.5">
            <p className="truncate text-sm font-medium text-foreground">{user?.name}</p>
            <p className="truncate text-xs text-foreground">{user?.email}</p>
          </div>
          <button
            onClick={() => void logout()}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive transition-colors hover:bg-white/10"
          >
            <LogOut size={16} />
            Log out
          </button>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        onClick={() => setActivePage("settings")}
        className="flex h-11 w-11 shrink-0 items-center justify-center border-l border-white/[0.08] text-muted-foreground transition-colors hover:bg-white/[0.07] hover:text-foreground"
        aria-label="Settings"
      >
        <Settings size={18} />
      </button>
    </div>
  );
}
