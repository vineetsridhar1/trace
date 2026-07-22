import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function DesignEditorColorField({
  label,
  value,
  allowTransparent = false,
  onChange,
}: {
  label: string;
  value: string;
  allowTransparent?: boolean;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const valid = isValidColor(draft, allowTransparent);
  const pickerValue = /^#[0-9a-f]{6}$/iu.test(value) ? value : "#ffffff";

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (valid) {
      onChange(draft.toLowerCase());
      return;
    }
    setDraft(value);
  };

  return (
    <label className="block min-w-0 space-y-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <div
        className={cn(
          "flex h-8 min-w-0 items-center rounded-lg border border-input bg-background px-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          !valid && "border-destructive",
        )}
      >
        <input
          type="color"
          value={pickerValue}
          aria-label={`Pick ${label.toLowerCase()}`}
          className="size-5 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
          onChange={(event) => {
            setDraft(event.target.value);
            onChange(event.target.value);
          }}
        />
        <input
          value={draft}
          aria-label={`${label} value`}
          aria-invalid={!valid}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent px-1.5 font-mono text-[10px] text-foreground outline-none"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(value);
              event.currentTarget.blur();
            }
          }}
        />
      </div>
    </label>
  );
}

function isValidColor(value: string, allowTransparent: boolean): boolean {
  return /^#[0-9a-f]{6}$/iu.test(value) || (allowTransparent && value === "transparent");
}
