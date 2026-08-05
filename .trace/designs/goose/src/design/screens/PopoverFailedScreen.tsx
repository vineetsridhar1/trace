import { PopoverStage } from "../components/PopoverStage";
import { ToolsPopover } from "../components/ToolsPopover";
import { DesignScreen } from "../primitives/DesignScreen";

/**
 * Partial failure: one tool finished, one did not. The popover carries the reason
 * and a retry; the full log stays in Settings.
 */
export default function PopoverFailedScreen() {
  return (
    <DesignScreen
      data-trace-id="screen-popover-failed"
      data-trace-source="src/design/screens/PopoverFailedScreen.tsx"
    >
      <PopoverStage toolsState="failed">
        <ToolsPopover state="failed" />
      </PopoverStage>
    </DesignScreen>
  );
}
