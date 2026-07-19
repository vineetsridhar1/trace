import { Download } from "lucide-react";
import { Button } from "../../ui/button";

export type PdfPageFormat = { width: number; height: number; unit: "mm" | "in" };

const PRESETS: Array<{ label: string; format: PdfPageFormat }> = [
  { label: "A4 portrait", format: { width: 210, height: 297, unit: "mm" } },
  { label: "A4 landscape", format: { width: 297, height: 210, unit: "mm" } },
  { label: "US Letter", format: { width: 8.5, height: 11, unit: "in" } },
  { label: "US Letter landscape", format: { width: 11, height: 8.5, unit: "in" } },
  { label: "Square", format: { width: 8, height: 8, unit: "in" } },
];

export function PdfPreviewControls({
  format,
  onFormatChange,
  onDownload,
}: {
  format: PdfPageFormat;
  onFormatChange: (format: PdfPageFormat) => void;
  onDownload: () => void;
}) {
  return (
    <div className="flex h-10 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background px-3">
      <span className="text-xs font-medium text-muted-foreground">PDF size</span>
      <select
        aria-label="PDF page size"
        value={`${format.width}-${format.height}-${format.unit}`}
        onChange={(event) => {
          const preset = PRESETS.find(
            ({ format: value }) =>
              `${value.width}-${value.height}-${value.unit}` === event.target.value,
          );
          if (preset) onFormatChange(preset.format);
        }}
        className="h-7 rounded-md border border-input bg-background px-2 text-xs"
      >
        {PRESETS.map(({ label, format: value }) => (
          <option key={label} value={`${value.width}-${value.height}-${value.unit}`}>
            {label}
          </option>
        ))}
      </select>
      <input
        aria-label="PDF width"
        type="number"
        min="1"
        step="0.1"
        value={format.width}
        onChange={(event) =>
          onFormatChange({ ...format, width: Number(event.target.value) || format.width })
        }
        className="h-7 w-16 rounded-md border border-input bg-background px-2 text-xs"
      />
      <span className="text-xs text-muted-foreground">×</span>
      <input
        aria-label="PDF height"
        type="number"
        min="1"
        step="0.1"
        value={format.height}
        onChange={(event) =>
          onFormatChange({ ...format, height: Number(event.target.value) || format.height })
        }
        className="h-7 w-16 rounded-md border border-input bg-background px-2 text-xs"
      />
      <select
        aria-label="PDF unit"
        value={format.unit}
        onChange={(event) =>
          onFormatChange({ ...format, unit: event.target.value as PdfPageFormat["unit"] })
        }
        className="h-7 rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="mm">mm</option>
        <option value="in">in</option>
      </select>
      <Button size="sm" className="ml-auto h-7" onClick={onDownload}>
        <Download size={13} className="mr-1" />
        Download PDF
      </Button>
    </div>
  );
}
