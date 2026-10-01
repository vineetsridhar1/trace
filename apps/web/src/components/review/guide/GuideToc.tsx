import { cn } from "../../../lib/utils";

export function GuideToc({
  titles,
  activeIndex,
  onSelect,
}: {
  titles: string[];
  activeIndex: number;
  onSelect(index: number): void;
}) {
  return (
    <nav className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-[#1f1f23] px-4 text-xs font-medium">
      <span className="shrink-0 pl-1 pr-2 text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground">
        GUIDE
      </span>
      {titles.map((title, index) => (
        <button
          key={title}
          type="button"
          onClick={() => onSelect(index)}
          aria-current={index === activeIndex}
          className={cn(
            "shrink-0 whitespace-pre rounded-md px-2.5 py-[5px]",
            index === activeIndex
              ? "bg-[#262626] text-[#ededef]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {index + 1}&nbsp;&nbsp;{title}
        </button>
      ))}
    </nav>
  );
}
