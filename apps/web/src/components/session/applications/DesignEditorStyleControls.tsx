import type { ReactNode } from "react";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import type { DesignEditorStyles } from "../../../stores/design-editor";
import { DesignEditorColorField } from "./DesignEditorColorField";
import { DesignEditorNumberField } from "./DesignEditorNumberField";

export function DesignEditorStyleControls({
  styles,
  onChange,
}: {
  styles: DesignEditorStyles;
  onChange: <Key extends keyof DesignEditorStyles>(
    key: Key,
    value: DesignEditorStyles[Key],
  ) => void;
}) {
  return (
    <div className="divide-y divide-border">
      <PropertySection title="Typography">
        <DesignEditorColorField
          label="Text color"
          value={styles.color}
          onChange={(value) => onChange("color", value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <DesignEditorNumberField
            label="Size"
            value={styles.fontSize}
            min={8}
            max={96}
            onChange={(value) => onChange("fontSize", value)}
          />
          <SelectField
            label="Weight"
            value={String(styles.fontWeight)}
            options={[
              { value: "400", label: "Regular" },
              { value: "500", label: "Medium" },
              { value: "600", label: "Semibold" },
              { value: "700", label: "Bold" },
            ]}
            onChange={(value) => onChange("fontWeight", Number(value))}
          />
        </div>
        <AlignmentField
          value={styles.textAlign}
          onChange={(value) => onChange("textAlign", value)}
        />
      </PropertySection>

      <PropertySection title="Appearance">
        <div className="grid grid-cols-2 gap-2">
          <DesignEditorColorField
            label="Fill"
            value={styles.backgroundColor}
            allowTransparent
            onChange={(value) => onChange("backgroundColor", value)}
          />
          <DesignEditorNumberField
            label="Radius"
            value={styles.borderRadius}
            min={0}
            max={64}
            onChange={(value) => onChange("borderRadius", value)}
          />
        </div>
      </PropertySection>

      <PropertySection title="Spacing">
        <div className="grid grid-cols-2 gap-2">
          <DesignEditorNumberField
            label="Horizontal"
            value={styles.paddingX}
            min={0}
            max={64}
            onChange={(value) => onChange("paddingX", value)}
          />
          <DesignEditorNumberField
            label="Vertical"
            value={styles.paddingY}
            min={0}
            max={64}
            onChange={(value) => onChange("paddingY", value)}
          />
        </div>
      </PropertySection>
    </div>
  );
}

function PropertySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5 px-4 py-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0 space-y-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <Select value={value} onValueChange={(next) => next && onChange(next)}>
        <SelectTrigger className="h-8 w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

const ALIGNMENTS = [
  { value: "left", label: "Align left", icon: AlignLeft },
  { value: "center", label: "Align center", icon: AlignCenter },
  { value: "right", label: "Align right", icon: AlignRight },
] as const;

function AlignmentField({
  value,
  onChange,
}: {
  value: DesignEditorStyles["textAlign"];
  onChange: (value: DesignEditorStyles["textAlign"]) => void;
}) {
  return (
    <div className="space-y-1 text-[11px] text-muted-foreground">
      <span>Alignment</span>
      <div className="grid h-8 grid-cols-3 rounded-lg border border-input bg-background p-0.5">
        {ALIGNMENTS.map((alignment) => {
          const Icon = alignment.icon;
          const active = value === alignment.value;
          return (
            <button
              key={alignment.value}
              type="button"
              aria-label={alignment.label}
              aria-pressed={active}
              className={cn(
                "flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                active && "bg-muted text-foreground shadow-xs",
              )}
              onClick={() => onChange(alignment.value)}
            >
              <Icon className="size-3.5" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
