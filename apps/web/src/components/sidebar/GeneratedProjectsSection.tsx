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
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors",
        "pl-4",
        activePage === "create"
          ? "bg-white/10 text-foreground"
          : "text-foreground hover:bg-white/10",
      )}
    >
      <Sparkles size={16} className="shrink-0" />
      <span>Creations</span>
    </button>
  );
}
