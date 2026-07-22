import type { DesignEditorStyles } from "../../../stores/design-editor";
import { DesignEditorPropertySection } from "./DesignEditorPropertySection";
import { DesignEditorSelectField } from "./DesignEditorSelectField";
import { DesignEditorTextField } from "./DesignEditorTextField";

type ChangeStyle = <Key extends keyof DesignEditorStyles>(
  key: Key,
  value: DesignEditorStyles[Key],
) => void;

export function DesignEditorAdvancedSection({
  styles,
  onChange,
}: {
  styles: DesignEditorStyles;
  onChange: ChangeStyle;
}) {
  return (
    <DesignEditorPropertySection title="Advanced" collapsible>
      <div className="grid grid-cols-2 gap-2">
        <DesignEditorSelectField
          label="Cursor"
          value={styles.cursor}
          options={CURSOR_OPTIONS}
          onChange={(value) => onChange("cursor", value as DesignEditorStyles["cursor"])}
        />
        <DesignEditorSelectField
          label="Pointer events"
          value={styles.pointerEvents}
          options={POINTER_EVENT_OPTIONS}
          onChange={(value) =>
            onChange("pointerEvents", value as DesignEditorStyles["pointerEvents"])
          }
        />
        <DesignEditorSelectField
          label="White space"
          value={styles.whiteSpace}
          options={WHITE_SPACE_OPTIONS}
          onChange={(value) => onChange("whiteSpace", value as DesignEditorStyles["whiteSpace"])}
        />
        <DesignEditorSelectField
          label="Text overflow"
          value={styles.textOverflow}
          options={TEXT_OVERFLOW_OPTIONS}
          onChange={(value) =>
            onChange("textOverflow", value as DesignEditorStyles["textOverflow"])
          }
        />
        <DesignEditorSelectField
          label="Box sizing"
          value={styles.boxSizing}
          options={BOX_SIZING_OPTIONS}
          onChange={(value) => onChange("boxSizing", value as DesignEditorStyles["boxSizing"])}
        />
        <DesignEditorTextField
          label="Aspect ratio"
          value={styles.aspectRatio}
          onChange={(value) => onChange("aspectRatio", value)}
        />
      </div>
      <DesignEditorTextField
        label="Transform"
        value={styles.transform}
        onChange={(value) => onChange("transform", value)}
      />
      <DesignEditorTextField
        label="Filter"
        value={styles.filter}
        onChange={(value) => onChange("filter", value)}
      />
    </DesignEditorPropertySection>
  );
}

const CURSOR_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "default", label: "Default" },
  { value: "pointer", label: "Pointer" },
  { value: "grab", label: "Grab" },
  { value: "grabbing", label: "Grabbing" },
  { value: "text", label: "Text" },
  { value: "move", label: "Move" },
  { value: "not-allowed", label: "Not allowed" },
  { value: "crosshair", label: "Crosshair" },
  { value: "zoom-in", label: "Zoom in" },
  { value: "zoom-out", label: "Zoom out" },
] as const;

const POINTER_EVENT_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "none", label: "None" },
] as const;

const WHITE_SPACE_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "nowrap", label: "No wrap" },
  { value: "pre", label: "Pre" },
  { value: "pre-wrap", label: "Pre wrap" },
  { value: "pre-line", label: "Pre line" },
  { value: "break-spaces", label: "Break spaces" },
] as const;

const TEXT_OVERFLOW_OPTIONS = [
  { value: "clip", label: "Clip" },
  { value: "ellipsis", label: "Ellipsis" },
] as const;

const BOX_SIZING_OPTIONS = [
  { value: "content-box", label: "Content box" },
  { value: "border-box", label: "Border box" },
] as const;
