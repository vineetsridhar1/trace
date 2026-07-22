import { cn } from "@/lib/utils";
import { Input } from "../../ui/input";

type SizingMode = "hug" | "fixed" | "fill";

export function DesignEditorSizingModeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const mode: SizingMode =
    value === "auto" || value === "fit-content" ? "hug" : value === "100%" ? "fill" : "fixed";
  const setMode = (next: SizingMode) => {
    if (next === "hug") onChange("fit-content");
    else if (next === "fill") onChange("100%");
    else if (mode !== "fixed") onChange("100px");
  };

  return (
    <div className="space-y-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <div className="flex h-8 items-center rounded-lg border border-input bg-muted/35 p-0.5 pl-2">
        <Input
          value={value}
          aria-label={`${label} value`}
          spellCheck={false}
          className="h-6 min-w-0 flex-1 border-0 bg-transparent px-0 font-mono text-[11px] shadow-none focus-visible:ring-0 dark:bg-transparent"
          onChange={(event) => onChange(event.target.value)}
        />
        {(["hug", "fixed", "fill"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            className={cn(
              "h-6 rounded-md px-1.5 text-[10px] capitalize text-muted-foreground hover:text-foreground",
              mode === option && "bg-background text-foreground shadow-xs",
            )}
            onClick={() => setMode(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
