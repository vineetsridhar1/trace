import { AppChrome } from "../components/AppChrome";
import { SessionTable } from "../components/SessionTable";
import { DesignScreen } from "../primitives/DesignScreen";

/**
 * Trace launch with two out-of-date tools and no dialog. The only signal is the
 * sidebar footer row, which replaces the auto-opening popup.
 */
export default function HomeUpdatesScreen() {
  return (
    <DesignScreen
      data-trace-id="screen-home-updates"
      data-trace-source="src/design/screens/HomeUpdatesScreen.tsx"
    >
      <AppChrome toolsState="updates">
        <SessionTable />
      </AppChrome>
    </DesignScreen>
  );
}
