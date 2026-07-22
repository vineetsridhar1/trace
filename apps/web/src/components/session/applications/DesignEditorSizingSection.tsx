import type { DesignEditorStyles } from "../../../stores/design-editor";
import { DesignEditorNumberField } from "./DesignEditorNumberField";
import { DesignEditorPropertySection } from "./DesignEditorPropertySection";
import { DesignEditorSelectField } from "./DesignEditorSelectField";
import { DesignEditorSizingModeField } from "./DesignEditorSizingModeField";
import { DesignEditorTextField } from "./DesignEditorTextField";

type ChangeStyle = <Key extends keyof DesignEditorStyles>(
  key: Key,
  value: DesignEditorStyles[Key],
) => void;

export function DesignEditorSizingSection({
  styles,
  onChange,
}: {
  styles: DesignEditorStyles;
  onChange: ChangeStyle;
}) {
  return (
    <>
      <DesignEditorPropertySection title="Sizing">
        <DesignEditorSizingModeField
          label="Width"
          value={styles.width}
          onChange={(value) => onChange("width", value)}
        />
        <DesignEditorSizingModeField
          label="Height"
          value={styles.height}
          onChange={(value) => onChange("height", value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <DesignEditorNumberField
            label="Grow"
            value={styles.flexGrow}
            min={0}
            max={100}
            unit=""
            onChange={(value) => onChange("flexGrow", value)}
          />
          <DesignEditorSelectField
            label="Align self"
            value={styles.alignSelf}
            options={ALIGN_SELF_OPTIONS}
            onChange={(value) => onChange("alignSelf", value as DesignEditorStyles["alignSelf"])}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DesignEditorTextField
            label="Min width"
            value={styles.minWidth}
            onChange={(value) => onChange("minWidth", value)}
          />
          <DesignEditorTextField
            label="Max width"
            value={styles.maxWidth}
            onChange={(value) => onChange("maxWidth", value)}
          />
          <DesignEditorTextField
            label="Min height"
            value={styles.minHeight}
            onChange={(value) => onChange("minHeight", value)}
          />
          <DesignEditorTextField
            label="Max height"
            value={styles.maxHeight}
            onChange={(value) => onChange("maxHeight", value)}
          />
        </div>
      </DesignEditorPropertySection>

      <DesignEditorPropertySection title="Position">
        <div className="grid grid-cols-2 gap-2">
          <DesignEditorSelectField
            label="Mode"
            value={styles.position}
            options={POSITION_OPTIONS}
            onChange={(value) => onChange("position", value as DesignEditorStyles["position"])}
          />
          <DesignEditorTextField
            label="Z-index"
            value={styles.zIndex}
            onChange={(value) => onChange("zIndex", value)}
          />
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {(["top", "right", "bottom", "left"] as const).map((key) => (
            <DesignEditorTextField
              key={key}
              label={key.charAt(0).toUpperCase()}
              value={styles[key]}
              onChange={(value) => onChange(key, value)}
            />
          ))}
        </div>
      </DesignEditorPropertySection>
    </>
  );
}

const ALIGN_SELF_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "flex-start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "flex-end", label: "End" },
  { value: "stretch", label: "Stretch" },
  { value: "baseline", label: "Baseline" },
] as const;

const POSITION_OPTIONS = [
  { value: "static", label: "Inline" },
  { value: "relative", label: "Relative" },
  { value: "absolute", label: "Absolute" },
  { value: "fixed", label: "Fixed" },
  { value: "sticky", label: "Sticky" },
] as const;
