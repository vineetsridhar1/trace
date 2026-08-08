import { AppChrome } from "../components/AppChrome";
import { SettingsCodingTools } from "../components/SettingsCodingTools";
import { failedTools } from "../components/toolsData";
import { DesignScreen } from "../primitives/DesignScreen";

/**
 * Partial failure. The reason attaches to the row that failed rather than to the
 * page, so a successful update in the same batch still reads as done.
 */
export default function SettingsToolsFailedScreen() {
  return (
    <DesignScreen
      data-trace-id="screen-settings-tools-failed"
      data-trace-source="src/design/screens/SettingsToolsFailedScreen.tsx"
    >
      <AppChrome title="Settings" subtitle="Coding tools" showActions={false} toolsState="failed">
        <SettingsCodingTools tools={failedTools} summary="failed" />
      </AppChrome>
    </DesignScreen>
  );
}
