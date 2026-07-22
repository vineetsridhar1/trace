import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Italic,
  Strikethrough,
  Underline,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DesignEditorStyles } from "../../../stores/design-editor";
import { DesignEditorColorField } from "./DesignEditorColorField";
import { DesignEditorNumberField } from "./DesignEditorNumberField";
import { DesignEditorPropertySection } from "./DesignEditorPropertySection";
import { DesignEditorSelectField } from "./DesignEditorSelectField";
import { DesignEditorTextField } from "./DesignEditorTextField";

type ChangeStyle = <Key extends keyof DesignEditorStyles>(
  key: Key,
  value: DesignEditorStyles[Key],
) => void;

export function DesignEditorTypographySection({
  styles,
  onChange,
}: {
  styles: DesignEditorStyles;
  onChange: ChangeStyle;
}) {
  return (
    <DesignEditorPropertySection title="Text">
      <DesignEditorTextField
        label="Font"
        value={styles.fontFamily}
        onChange={(value) => onChange("fontFamily", value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <DesignEditorNumberField
          label="Size"
          value={styles.fontSize}
          min={8}
          max={96}
          onChange={(value) => onChange("fontSize", value)}
        />
        <DesignEditorColorField
          label="Color"
          value={styles.color}
          onChange={(value) => onChange("color", value)}
        />
        <DesignEditorSelectField
          label="Weight"
          value={String(styles.fontWeight)}
          options={FONT_WEIGHTS}
          onChange={(value) => onChange("fontWeight", Number(value))}
        />
        <DesignEditorNumberField
          label="Leading"
          value={styles.lineHeight}
          min={8}
          max={240}
          onChange={(value) => onChange("lineHeight", value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StyleButtons styles={styles} onChange={onChange} />
        <AlignmentButtons
          value={styles.textAlign}
          onChange={(value) => onChange("textAlign", value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DesignEditorSelectField
          label="Case"
          value={styles.textTransform}
          options={TEXT_TRANSFORMS}
          onChange={(value) =>
            onChange("textTransform", value as DesignEditorStyles["textTransform"])
          }
        />
        <DesignEditorNumberField
          label="Tracking"
          value={styles.letterSpacing}
          min={-32}
          max={64}
          onChange={(value) => onChange("letterSpacing", value)}
        />
      </div>
    </DesignEditorPropertySection>
  );
}

function StyleButtons({ styles, onChange }: { styles: DesignEditorStyles; onChange: ChangeStyle }) {
  const buttons = [
    {
      label: "Italic",
      active: styles.fontStyle === "italic",
      icon: Italic,
      action: () => onChange("fontStyle", styles.fontStyle === "italic" ? "normal" : "italic"),
    },
    {
      label: "Underline",
      active: styles.textDecoration === "underline",
      icon: Underline,
      action: () =>
        onChange("textDecoration", styles.textDecoration === "underline" ? "none" : "underline"),
    },
    {
      label: "Strikethrough",
      active: styles.textDecoration === "line-through",
      icon: Strikethrough,
      action: () =>
        onChange(
          "textDecoration",
          styles.textDecoration === "line-through" ? "none" : "line-through",
        ),
    },
  ];
  return <IconButtonGroup label="Style" buttons={buttons} />;
}

function AlignmentButtons({
  value,
  onChange,
}: {
  value: DesignEditorStyles["textAlign"];
  onChange: (value: DesignEditorStyles["textAlign"]) => void;
}) {
  const buttons = [
    {
      label: "Align left",
      active: value === "left",
      icon: AlignLeft,
      action: () => onChange("left"),
    },
    {
      label: "Align center",
      active: value === "center",
      icon: AlignCenter,
      action: () => onChange("center"),
    },
    {
      label: "Align right",
      active: value === "right",
      icon: AlignRight,
      action: () => onChange("right"),
    },
    {
      label: "Justify",
      active: value === "justify",
      icon: AlignJustify,
      action: () => onChange("justify"),
    },
  ];
  return <IconButtonGroup label="Align" buttons={buttons} />;
}

function IconButtonGroup({
  label,
  buttons,
}: {
  label: string;
  buttons: Array<{ label: string; active: boolean; icon: typeof Italic; action: () => void }>;
}) {
  return (
    <div className="space-y-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <div className="flex h-8 rounded-lg border border-input bg-muted/35 p-0.5">
        {buttons.map((button) => {
          const Icon = button.icon;
          return (
            <button
              key={button.label}
              type="button"
              aria-label={button.label}
              aria-pressed={button.active}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
                button.active && "bg-background text-foreground shadow-xs",
              )}
              onClick={button.action}
            >
              <Icon className="size-3.5" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

const FONT_WEIGHTS = [
  { value: "100", label: "Thin" },
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semibold" },
  { value: "700", label: "Bold" },
  { value: "900", label: "Black" },
] as const;

const TEXT_TRANSFORMS = [
  { value: "none", label: "None" },
  { value: "uppercase", label: "Uppercase" },
  { value: "lowercase", label: "Lowercase" },
  { value: "capitalize", label: "Capitalize" },
] as const;
