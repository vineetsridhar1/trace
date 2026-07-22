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

export function DesignEditorAppearanceSection({
  styles,
  onChange,
}: {
  styles: DesignEditorStyles;
  onChange: ChangeStyle;
}) {
  return (
    <>
      <DesignEditorPropertySection title="Appearance">
        <DesignEditorColorField
          label="Background"
          value={styles.backgroundColor}
          allowTransparent
          onChange={(value) => onChange("backgroundColor", value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <DesignEditorNumberField
            label="Radius"
            value={styles.borderRadius}
            min={0}
            max={512}
            onChange={(value) => onChange("borderRadius", value)}
          />
          <DesignEditorNumberField
            label="Opacity"
            value={Math.round(styles.opacity * 100)}
            min={0}
            max={100}
            unit="%"
            onChange={(value) => onChange("opacity", value / 100)}
          />
          <DesignEditorSelectField
            label="Overflow"
            value={styles.overflow}
            options={OVERFLOW_OPTIONS}
            onChange={(value) => onChange("overflow", value as DesignEditorStyles["overflow"])}
          />
          <DesignEditorSelectField
            label="Object fit"
            value={styles.objectFit}
            options={OBJECT_FIT_OPTIONS}
            onChange={(value) => onChange("objectFit", value as DesignEditorStyles["objectFit"])}
          />
        </div>
        <DesignEditorTextField
          label="Shadow"
          value={styles.boxShadow}
          onChange={(value) => onChange("boxShadow", value)}
        />
        <DesignEditorTextField
          label="Text shadow"
          value={styles.textShadow}
          onChange={(value) => onChange("textShadow", value)}
        />
      </DesignEditorPropertySection>

      <DesignEditorPropertySection title="Border">
        <div className="grid grid-cols-2 gap-2">
          <DesignEditorColorField
            label="Color"
            value={styles.borderColor}
            allowTransparent
            onChange={(value) => onChange("borderColor", value)}
          />
          <DesignEditorNumberField
            label="Width"
            value={styles.borderWidth}
            min={0}
            max={32}
            onChange={(value) => onChange("borderWidth", value)}
          />
        </div>
        <DesignEditorSelectField
          label="Style"
          value={styles.borderStyle}
          options={BORDER_STYLE_OPTIONS}
          onChange={(value) => onChange("borderStyle", value as DesignEditorStyles["borderStyle"])}
        />
      </DesignEditorPropertySection>
    </>
  );
}

const OVERFLOW_OPTIONS = [
  { value: "visible", label: "Visible" },
  { value: "hidden", label: "Hidden" },
  { value: "clip", label: "Clip" },
  { value: "scroll", label: "Scroll" },
  { value: "auto", label: "Auto" },
] as const;

const OBJECT_FIT_OPTIONS = [
  { value: "fill", label: "Fill" },
  { value: "contain", label: "Contain" },
  { value: "cover", label: "Cover" },
  { value: "none", label: "None" },
  { value: "scale-down", label: "Scale down" },
] as const;

const BORDER_STYLE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
  { value: "double", label: "Double" },
] as const;
