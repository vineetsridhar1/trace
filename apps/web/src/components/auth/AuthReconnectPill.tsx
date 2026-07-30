import { motion } from "framer-motion";
import { CloudOff } from "lucide-react";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { useAuthReconnectStore } from "../../stores/auth-reconnect";
import { Button } from "../ui/button";

export function AuthReconnectPill() {
  const reauthRequired = useAuthStore((state: AuthState) => state.reauthRequired);
  const reminderCollapsed = useAuthReconnectStore((state) => state.reminderCollapsed);
  const dialogOpen = useAuthReconnectStore((state) => state.dialogOpen);
  const openDialog = useAuthReconnectStore((state) => state.openDialog);

  if (!reauthRequired || !reminderCollapsed || dialogOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="app-region-no-drag fixed right-3 top-[calc(env(safe-area-inset-top)+0.65rem)] z-[110]"
    >
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={openDialog}
        className="h-7 gap-1.5 rounded-full border-amber-500/35 bg-amber-500/15 px-2.5 text-xs font-medium text-amber-100 shadow-lg backdrop-blur-md hover:bg-amber-500/25 hover:text-amber-50"
      >
        <CloudOff size={13} />
        <span>Sync paused · Reconnect</span>
      </Button>
    </motion.div>
  );
}
