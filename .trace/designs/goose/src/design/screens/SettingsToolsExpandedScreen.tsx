import { AppChrome } from "../components/AppChrome";
import { SettingsCodingTools } from "../components/SettingsCodingTools";
import { DesignScreen } from "../primitives/DesignScreen";

/**
 * Settings with a tool row expanded and the available list open. This is the
 * detail the popover deliberately leaves out: install path, source, history,
 * release notes, and removal.
 */
export default function SettingsToolsExpandedScreen() {
  return (
    <DesignScreen
      data-trace-id="screen-settings-tools-expanded"
      data-trace-source="src/design/screens/SettingsToolsExpandedScreen.tsx"
    >
      <AppChrome title="Settings" subtitle="Coding tools" showActions={false} toolsState="updates">
        <SettingsCodingTools accordionOpen expandedId="claude-code" />
      </AppChrome>
    </DesignScreen>
  );
}
