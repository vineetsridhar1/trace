import type { DesignEditorStyles } from "../../../stores/design-editor";
import { DesignEditorAdvancedSection } from "./DesignEditorAdvancedSection";
import { DesignEditorAppearanceSection } from "./DesignEditorAppearanceSection";
import { DesignEditorLayoutSection } from "./DesignEditorLayoutSection";
import { DesignEditorSizingSection } from "./DesignEditorSizingSection";
import { DesignEditorTypographySection } from "./DesignEditorTypographySection";

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
    <div>
      <DesignEditorTypographySection styles={styles} onChange={onChange} />
      <DesignEditorSizingSection styles={styles} onChange={onChange} />
      <DesignEditorLayoutSection styles={styles} onChange={onChange} />
      <DesignEditorAppearanceSection styles={styles} onChange={onChange} />
      <DesignEditorAdvancedSection styles={styles} onChange={onChange} />
    </div>
  );
}
