import { PopoverStage } from "../components/PopoverStage";
import { ToolsPopover } from "../components/ToolsPopover";
import { DesignScreen } from "../primitives/DesignScreen";

/**
 * A primary tool is absent. Codex surfaces here rather than behind Available to
 * install, because it is a first-class session type regardless of this machine.
 */
export default function PopoverMissingScreen() {
  return (
    <DesignScreen
      data-trace-id="screen-popover-missing"
      data-trace-source="src/design/screens/PopoverMissingScreen.tsx"
    >
      <PopoverStage toolsState="missing">
        <ToolsPopover state="missing" />
      </PopoverStage>
    </DesignScreen>
  );
}
