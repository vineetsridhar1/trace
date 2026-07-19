import type { ReactNode } from "react";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Separator } from "../../ui/separator";
import type { DesignEditorStyles } from "../../../stores/design-editor";

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
    <>
      <Separator />
      <PropertySection title="Typography">
        <div className="grid grid-cols-2 gap-3">
          <ColorField
            label="Text color"
            value={styles.color}
            onChange={(value) => onChange("color", value)}
          />
          <NumberField
            label="Size"
            value={styles.fontSize}
            min={8}
            max={96}
            onChange={(value) => onChange("fontSize", value)}
          />
          <SelectField
            label="Weight"
            value={String(styles.fontWeight)}
            options={["400", "500", "600", "700"]}
            onChange={(value) => onChange("fontWeight", Number(value))}
          />
          <SelectField
            label="Align"
            value={styles.textAlign}
            options={["left", "center", "right"]}
            onChange={(value) => onChange("textAlign", value as DesignEditorStyles["textAlign"])}
          />
        </div>
      </PropertySection>

      <Separator />
      <PropertySection title="Appearance">
        <div className="grid grid-cols-2 gap-3">
          <ColorField
            label="Background"
            value={styles.backgroundColor}
            onChange={(value) => onChange("backgroundColor", value)}
          />
          <NumberField
            label="Radius"
            value={styles.borderRadius}
            min={0}
            max={64}
            onChange={(value) => onChange("borderRadius", value)}
          />
        </div>
      </PropertySection>

      <Separator />
      <PropertySection title="Spacing">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Horizontal"
            value={styles.paddingX}
            min={0}
            max={64}
            onChange={(value) => onChange("paddingX", value)}
          />
          <NumberField
            label="Vertical"
            value={styles.paddingY}
            min={0}
            max={64}
            onChange={(value) => onChange("paddingY", value)}
          />
        </div>
      </PropertySection>
    </>
  );
}

function PropertySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const pickerValue = /^#[0-9a-f]{6}$/iu.test(value) ? value : "#ffffff";
  return (
    <label className="space-y-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      <div className="flex h-8 items-center gap-2 rounded-md border border-input px-2">
        <input
          type="color"
          value={pickerValue}
          aria-label={label}
          className="size-5 cursor-pointer border-0 bg-transparent p-0"
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="font-mono text-[10px] text-foreground">{value}</span>
      </div>
    </label>
  );
}

function NumberField({
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
  return (
    <label className="space-y-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.round(next))));
        }}
      />
    </label>
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
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      <Select value={value} onValueChange={(next) => next && onChange(next)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
