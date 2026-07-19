import type { PdfPageFormat } from "./PdfPreviewControls";
import { Input } from "../../ui/input";
import { useEffect, useState } from "react";

const PRESETS: Array<{ label: string; format: PdfPageFormat }> = [
  { label: "A4 portrait", format: { width: 210, height: 297, unit: "mm" } },
  { label: "A4 landscape", format: { width: 297, height: 210, unit: "mm" } },
  { label: "US Letter", format: { width: 8.5, height: 11, unit: "in" } },
  { label: "US Letter landscape", format: { width: 11, height: 8.5, unit: "in" } },
  { label: "Square", format: { width: 8, height: 8, unit: "in" } },
];

export function PdfFormatFields({
  format,
  onFormatChange,
}: {
  format: PdfPageFormat;
  onFormatChange: (format: PdfPageFormat) => void;
}) {
  const presetValue = PRESETS.find(
    ({ format: value }) =>
      value.width === format.width && value.height === format.height && value.unit === format.unit,
  );
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">PDF size</span>
      <select
        aria-label="PDF page size"
        value={presetValue ? `${format.width}-${format.height}-${format.unit}` : "custom"}
        onChange={(event) => {
          const preset = PRESETS.find(
            ({ format: value }) =>
              `${value.width}-${value.height}-${value.unit}` === event.target.value,
          );
          if (preset) onFormatChange(preset.format);
        }}
        className="h-7 min-w-0 max-w-36 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="custom" disabled>
          Custom
        </option>
        {PRESETS.map(({ label, format: value }) => (
          <option key={label} value={`${value.width}-${value.height}-${value.unit}`}>
            {label}
          </option>
        ))}
      </select>
      <DimensionInput
        label="PDF width"
        unit={format.unit}
        value={format.width}
        onCommit={(width) => onFormatChange({ ...format, width })}
      />
      <span className="text-xs text-muted-foreground">×</span>
      <DimensionInput
        label="PDF height"
        unit={format.unit}
        value={format.height}
        onCommit={(height) => onFormatChange({ ...format, height })}
      />
      <select
        aria-label="PDF unit"
        value={format.unit}
        onChange={(event) =>
          onFormatChange(convertUnit(format, event.target.value as PdfPageFormat["unit"]))
        }
        className="h-7 shrink-0 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="mm">mm</option>
        <option value="in">in</option>
      </select>
    </div>
  );
}

function DimensionInput({
  label,
  unit,
  value,
  onCommit,
}: {
  label: string;
  unit: PdfPageFormat["unit"];
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const next = Number(draft);
    if (Number.isFinite(next) && next > 0) onCommit(next);
    else setDraft(String(value));
  };
  return (
    <Input
      aria-label={label}
      type="number"
      min="0.5"
      max={unit === "mm" ? 5080 : 200}
      step="0.1"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") setDraft(String(value));
      }}
      className="h-7 w-16 shrink-0 rounded-md bg-background px-2 py-0 text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

function convertUnit(format: PdfPageFormat, unit: PdfPageFormat["unit"]): PdfPageFormat {
  if (format.unit === unit) return format;
  const multiplier = unit === "mm" ? 25.4 : 1 / 25.4;
  const convert = (value: number) => Math.round(value * multiplier * 100) / 100;
  return { width: convert(format.width), height: convert(format.height), unit };
}
