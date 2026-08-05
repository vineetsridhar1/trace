import { AppChrome } from "../components/AppChrome";
import { SessionTable } from "../components/SessionTable";
import { ToolsPopover } from "../components/ToolsPopover";
import { DesignScreen } from "../primitives/DesignScreen";

/**
 * The user opens the surface deliberately. The popover answers the whole
 * question in place and offers Update all without leaving the session list, so
 * most visits never reach Settings at all.
 */
export default function HomeToolsMenuScreen() {
  return (
    <DesignScreen
      data-trace-id="screen-home-tools-menu"
      data-trace-source="src/design/screens/HomeToolsMenuScreen.tsx"
    >
      <AppChrome toolsState="updates" toolsActive toolsPopover={<ToolsPopover />}>
        <SessionTable />
      </AppChrome>
    </DesignScreen>
  );
}
