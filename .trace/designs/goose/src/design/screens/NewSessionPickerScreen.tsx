import { AppChrome } from "../components/AppChrome";
import { NewSessionPicker } from "../components/NewSessionPicker";
import { SessionTable } from "../components/SessionTable";
import { DesignScreen } from "../primitives/DesignScreen";

/**
 * The contextual catch. A missing tool is raised at the moment the user tries to
 * start that session type, which is the only place it is genuinely urgent.
 */
export default function NewSessionPickerScreen() {
  return (
    <DesignScreen
      data-trace-id="screen-new-session-picker"
      data-trace-source="src/design/screens/NewSessionPickerScreen.tsx"
    >
      <AppChrome toolsState="updates" overlay={<NewSessionPicker />}>
        <SessionTable />
      </AppChrome>
    </DesignScreen>
  );
}
