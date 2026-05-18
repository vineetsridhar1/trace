import { motion } from "framer-motion";
import { cn } from "../../lib/utils";
import type { PromptTimelineItem } from "./promptTimelineTypes";

interface PromptTimelineMarkerListProps {
  items: readonly PromptTimelineItem[];
  activeId: string | null;
  selectedPromptId: string | null;
  currentPromptId: string | null;
  onActiveChange: (id: string | null) => void;
  onSelect: (id: string) => void;
  onScroll: (scrollTop: number) => void;
}

export function PromptTimelineMarkerList({
  items,
  activeId,
  selectedPromptId,
  currentPromptId,
  onActiveChange,
  onSelect,
  onScroll,
}: PromptTimelineMarkerListProps) {
  return (
    <div
      className="max-h-[70vh] overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onScroll={(event) => onScroll(event.currentTarget.scrollTop)}
    >
      <div className="relative flex w-14 flex-col items-end gap-0.5 px-1.5 py-2">
        {items.map((item, index) => {
          const active = activeId === item.id;
          const highlighted =
            active ||
            (!activeId && selectedPromptId === item.id) ||
            (!activeId && !selectedPromptId && currentPromptId === item.id);
          return (
            <div key={item.id} className="relative flex w-full justify-end">
              <button
                type="button"
                aria-label={`Jump to prompt ${index + 1}`}
                onClick={() => onSelect(item.id)}
                onMouseEnter={() => onActiveChange(item.id)}
                onMouseLeave={() => onActiveChange(null)}
                onFocus={() => onActiveChange(item.id)}
                onBlur={() => onActiveChange(null)}
                className="pointer-events-auto relative flex h-2 w-full cursor-pointer items-center justify-end rounded-full outline-none"
              >
                <motion.span
                  layout
                  initial={false}
                  animate={{
                    opacity: highlighted ? 1 : 0.28,
                    width: active ? "72%" : `${item.widthPercent}%`,
                  }}
                  transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
                  className={cn(
                    "h-0.5 rounded-full bg-white transition-shadow duration-200",
                    highlighted ? "shadow-lg shadow-white/35" : "shadow-none",
                  )}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
