import { AppChrome } from "../components/AppChrome";
import { SettingsCodingTools } from "../components/SettingsCodingTools";
import { pinnedMissingTools } from "../components/toolsData";
import { DesignScreen } from "../primitives/DesignScreen";

/**
 * Codex absent. It keeps its row in On this computer with the PRIMARY tag rather
 * than dropping into Available to install, and the header copy states the rule.
 */
export default function SettingsToolsPinnedMissingScreen() {
  return (
    <DesignScreen
      data-trace-id="screen-settings-tools-pinned-missing"
      data-trace-source="src/design/screens/SettingsToolsPinnedMissingScreen.tsx"
    >
      <AppChrome title="Settings" subtitle="Coding tools" showActions={false} toolsState="missing">
        <SettingsCodingTools tools={pinnedMissingTools} summary="missing" accordionOpen />
      </AppChrome>
    </DesignScreen>
  );
}
