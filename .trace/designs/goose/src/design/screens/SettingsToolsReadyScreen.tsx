import { AppChrome } from "../components/AppChrome";
import { SettingsCodingTools } from "../components/SettingsCodingTools";
import { everythingReady } from "../components/toolsData";
import { DesignScreen } from "../primitives/DesignScreen";

/**
 * The all-clear. No badge in the sidebar, no dot in the settings nav, no action
 * in the strip — the page still explains itself and holds the preferences.
 */
export default function SettingsToolsReadyScreen() {
  return (
    <DesignScreen
      data-trace-id="screen-settings-tools-ready"
      data-trace-source="src/design/screens/SettingsToolsReadyScreen.tsx"
    >
      <AppChrome title="Settings" subtitle="Coding tools" showActions={false} toolsState="ready">
        <SettingsCodingTools tools={everythingReady} summary="ready" />
      </AppChrome>
    </DesignScreen>
  );
}
