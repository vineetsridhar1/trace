import { AppChrome } from "../components/AppChrome";
import { SettingsCodingTools } from "../components/SettingsCodingTools";
import { updatingTools } from "../components/toolsData";
import { DesignScreen } from "../primitives/DesignScreen";

/**
 * Update all running. Progress sits in the Status column so the table keeps its
 * alignment, and every in-flight row can be cancelled individually.
 */
export default function SettingsToolsUpdatingScreen() {
  return (
    <DesignScreen
      data-trace-id="screen-settings-tools-updating"
      data-trace-source="src/design/screens/SettingsToolsUpdatingScreen.tsx"
    >
      <AppChrome
        title="Settings"
        subtitle="Coding tools"
        showActions={false}
        toolsState="installing"
      >
        <SettingsCodingTools tools={updatingTools} summary="updating" />
      </AppChrome>
    </DesignScreen>
  );
}
