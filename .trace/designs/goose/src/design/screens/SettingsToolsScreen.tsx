import { AppChrome } from "../components/AppChrome";
import { SettingsCodingTools } from "../components/SettingsCodingTools";
import { DesignScreen } from "../primitives/DesignScreen";

/**
 * The only full surface. The width buys aligned columns, the command names, the
 * per-tool controls the popover deliberately omits, and the preferences that
 * govern whether Trace ever nudges at all.
 */
export default function SettingsToolsScreen() {
  return (
    <DesignScreen
      data-trace-id="screen-settings-tools"
      data-trace-source="src/design/screens/SettingsToolsScreen.tsx"
    >
      <AppChrome title="Settings" subtitle="Coding tools" showActions={false} toolsState="updates">
        <SettingsCodingTools />
      </AppChrome>
    </DesignScreen>
  );
}
