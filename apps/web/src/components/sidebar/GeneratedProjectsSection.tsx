import { Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import { useHomeComposerStore } from "../../stores/home-composer";
import { useUIStore } from "../../stores/ui";
import { useSidebar } from "../ui/sidebar";

export function GeneratedProjectsSection() {
  const activePage = useUIStore((state) => state.activePage);
  const setActivePage = useUIStore((state) => state.setActivePage);
  const requestComposerFocus = useHomeComposerStore((state) => state.requestFocus);
  const { isMobile, setOpenMobile } = useSidebar();

  const openCreate = () => {
    setActivePage("create");
    requestComposerFocus();
    if (isMobile) setOpenMobile(false);
  };

  return (
    <button
      type="button"
      onClick={openCreate}
      className={cn(
        "flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 text-left text-sm font-medium transition-colors",
        activePage === "create"
          ? "bg-white/[0.1] text-foreground shadow-sm shadow-black/20"
          : "text-foreground/80 hover:bg-white/[0.07] hover:text-foreground",
      )}
    >
      <Sparkles size={16} className="shrink-0 text-muted-foreground" />
      <span>Creations</span>
    </button>
  );
}
