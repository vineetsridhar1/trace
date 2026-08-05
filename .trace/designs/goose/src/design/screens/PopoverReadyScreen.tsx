import { PopoverStage } from "../components/PopoverStage";
import { ToolsPopover } from "../components/ToolsPopover";
import { DesignScreen } from "../primitives/DesignScreen";

/**
 * Nothing to do. Opening it deliberately still has to be worth the click, so the
 * all-clear names the versions instead of showing an empty box.
 */
export default function PopoverReadyScreen() {
  return (
    <DesignScreen
      data-trace-id="screen-popover-ready"
      data-trace-source="src/design/screens/PopoverReadyScreen.tsx"
    >
      <PopoverStage toolsState="ready">
        <ToolsPopover state="ready" />
      </PopoverStage>
    </DesignScreen>
  );
}
