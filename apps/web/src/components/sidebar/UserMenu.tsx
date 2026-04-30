import { Settings, LogOut, Bot } from "lucide-react";
import { motion } from "framer-motion";
import { useAuthStore } from "@trace/client-core";
import { useUIStore } from "../../stores/ui";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { features } from "../../lib/features";
import { getInitials } from "../../lib/utils";

export function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setActivePage = useUIStore((s) => s.setActivePage);

  return (
    <Popover>
      <PopoverTrigger className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 transition-colors hover:bg-white/10">
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="relative shrink-0 overflow-hidden rounded-full"
        >
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} className="h-7 w-7 rounded-full" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-elevated text-[10px] font-semibold text-foreground">
              {getInitials(user?.name ?? "")}
            </div>
          )}
        </motion.div>
        <span className="flex-1 truncate text-left text-sm text-foreground">{user?.name}</span>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" sideOffset={4} className="w-56 gap-0 p-1.5">
        <div className="border-b border-border px-2 py-1.5 mb-1">
          <p className="text-sm font-medium text-foreground">{user?.name}</p>
          <p className="text-xs text-foreground">{user?.email}</p>
        </div>
        <button
          onClick={() => setActivePage("settings")}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-white/10"
        >
          <Settings size={16} className="text-foreground" />
          Settings
        </button>
        {features.agentDebug && (
          <button
            onClick={() => setActivePage("agent-debug")}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-white/10"
          >
            <Bot size={16} className="text-foreground" />
            Agent Debug
          </button>
        )}
        <button
          onClick={() => void logout()}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive transition-colors hover:bg-white/10"
        >
          <LogOut size={16} />
          Log out
        </button>
      </PopoverContent>
    </Popover>
  );
}
