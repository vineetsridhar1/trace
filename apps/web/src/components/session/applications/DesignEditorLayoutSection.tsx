import type { DesignEditorStyles } from "../../../stores/design-editor";
import { DesignEditorNumberField } from "./DesignEditorNumberField";
import { DesignEditorPropertySection } from "./DesignEditorPropertySection";
import { DesignEditorSelectField } from "./DesignEditorSelectField";

type ChangeStyle = <Key extends keyof DesignEditorStyles>(
  key: Key,
  value: DesignEditorStyles[Key],
) => void;

export function DesignEditorLayoutSection({
  styles,
  onChange,
}: {
  styles: DesignEditorStyles;
  onChange: ChangeStyle;
}) {
  const showsFlexControls = styles.display === "flex" || styles.display === "inline-flex";
  return (
    <>
      <DesignEditorPropertySection title="Contents layout" collapsible>
        <DesignEditorSelectField
          label="Display"
          value={styles.display}
          options={DISPLAY_OPTIONS}
          onChange={(value) => onChange("display", value as DesignEditorStyles["display"])}
        />
        {showsFlexControls ? (
          <div className="grid grid-cols-2 gap-2">
            <DesignEditorSelectField
              label="Direction"
              value={styles.flexDirection}
              options={DIRECTION_OPTIONS}
              onChange={(value) =>
                onChange("flexDirection", value as DesignEditorStyles["flexDirection"])
              }
            />
            <DesignEditorNumberField
              label="Gap"
              value={styles.gap}
              min={0}
              max={256}
              onChange={(value) => onChange("gap", value)}
            />
            <DesignEditorSelectField
              label="Main axis"
              value={styles.justifyContent}
              options={JUSTIFY_OPTIONS}
              onChange={(value) =>
                onChange("justifyContent", value as DesignEditorStyles["justifyContent"])
              }
            />
            <DesignEditorSelectField
              label="Cross axis"
              value={styles.alignItems}
              options={ALIGN_ITEMS_OPTIONS}
              onChange={(value) =>
                onChange("alignItems", value as DesignEditorStyles["alignItems"])
              }
            />
          </div>
        ) : null}
      </DesignEditorPropertySection>

      <SpacingSection title="Padding" prefix="padding" styles={styles} onChange={onChange} />
      <SpacingSection title="Margin" prefix="margin" styles={styles} onChange={onChange} />
    </>
  );
}

function SpacingSection({
  title,
  prefix,
  styles,
  onChange,
}: {
  title: string;
  prefix: "padding" | "margin";
  styles: DesignEditorStyles;
  onChange: ChangeStyle;
}) {
  const keys = [`${prefix}Top`, `${prefix}Right`, `${prefix}Bottom`, `${prefix}Left`] as const;
  return (
    <DesignEditorPropertySection title={title}>
      <div className="grid grid-cols-4 gap-1.5">
        {keys.map((key, index) => (
          <DesignEditorNumberField
            key={key}
            label={["T", "R", "B", "L"][index]!}
            value={styles[key]}
            min={prefix === "margin" ? -512 : 0}
            max={512}
            onChange={(value) => onChange(key, value)}
          />
        ))}
      </div>
    </DesignEditorPropertySection>
  );
}

const DISPLAY_OPTIONS = [
  { value: "block", label: "Block" },
  { value: "inline", label: "Inline" },
  { value: "inline-block", label: "Inline block" },
  { value: "flex", label: "Flex" },
  { value: "inline-flex", label: "Inline flex" },
  { value: "grid", label: "Grid" },
  { value: "inline-grid", label: "Inline grid" },
  { value: "none", label: "Hidden" },
] as const;

const DIRECTION_OPTIONS = [
  { value: "row", label: "Row" },
  { value: "row-reverse", label: "Row reverse" },
  { value: "column", label: "Column" },
  { value: "column-reverse", label: "Column reverse" },
] as const;

const JUSTIFY_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "flex-start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "flex-end", label: "End" },
  { value: "space-between", label: "Space between" },
  { value: "space-around", label: "Space around" },
  { value: "space-evenly", label: "Space evenly" },
] as const;

const ALIGN_ITEMS_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "flex-start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "flex-end", label: "End" },
  { value: "stretch", label: "Stretch" },
  { value: "baseline", label: "Baseline" },
] as const;
