import { Sparkles } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { useHomeComposerStore } from "../../stores/home-composer";
import { useSidebar } from "../ui/sidebar";

export function StartAnythingButton() {
  const setActiveChannelId = useUIStore((state) => state.setActiveChannelId);
  const requestFocus = useHomeComposerStore((state) => state.requestFocus);
  const { isMobile, setOpenMobile } = useSidebar();

  const start = () => {
    setActiveChannelId(null);
    requestFocus();
    if (isMobile) setOpenMobile(false);
  };

  return (
    <button
      type="button"
      onClick={start}
      className="flex h-9 w-full items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--th-accent)_45%,transparent)] bg-[var(--th-accent-tint)] px-2.5 text-left text-[13px] font-medium text-[var(--th-heading)] transition-colors hover:border-[color-mix(in_srgb,var(--th-accent)_60%,transparent)] hover:bg-[color-mix(in_srgb,var(--th-accent)_18%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--th-accent-light)]"
    >
      <Sparkles className="size-3.5 shrink-0 text-[var(--th-accent-light)]" />
      <span className="min-w-0 flex-1 truncate">Start anything…</span>
      <kbd className="rounded border border-[var(--th-edge)] bg-[var(--th-surface)] px-1.5 py-0.5 font-mono text-[9px] font-normal text-[var(--th-muted)]">
        ⌘N
      </kbd>
    </button>
  );
}
