import { Minus, Plus } from "lucide-react";

export function DesignEditorNumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const changeBy = (amount: number) => onChange(Math.min(max, Math.max(min, value + amount)));
  return (
    <label className="block min-w-0 space-y-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <span className="flex h-8 min-w-0 items-center rounded-lg border border-input bg-background px-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={value <= min}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
          onClick={() => changeBy(-1)}
        >
          <Minus className="size-3" />
        </button>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          aria-label={label}
          className="min-w-0 flex-1 appearance-none bg-transparent px-0.5 text-right text-xs text-foreground outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.round(next))));
          }}
        />
        <span className="pr-0.5 text-[10px] text-muted-foreground">px</span>
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={value >= max}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
          onClick={() => changeBy(1)}
        >
          <Plus className="size-3" />
        </button>
      </span>
    </label>
  );
}
