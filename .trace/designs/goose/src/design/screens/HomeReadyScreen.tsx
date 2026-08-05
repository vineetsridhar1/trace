import { AppChrome } from "../components/AppChrome";
import { SessionTable } from "../components/SessionTable";
import { DesignScreen } from "../primitives/DesignScreen";

/**
 * The same launch when nothing needs attention: the footer row goes quiet, keeps
 * its place, and drops the count badge.
 */
export default function HomeReadyScreen() {
  return (
    <DesignScreen
      data-trace-id="screen-home-ready"
      data-trace-source="src/design/screens/HomeReadyScreen.tsx"
    >
      <AppChrome toolsState="ready">
        <SessionTable />
      </AppChrome>
    </DesignScreen>
  );
}
