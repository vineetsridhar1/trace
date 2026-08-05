import { PopoverStage } from "../components/PopoverStage";
import { ToolsPopover } from "../components/ToolsPopover";
import { DesignScreen } from "../primitives/DesignScreen";

/**
 * Update all runs in place rather than navigating. The sidebar row switches to
 * Updating, so progress survives dismissing the popover.
 */
export default function PopoverUpdatingScreen() {
  return (
    <DesignScreen
      data-trace-id="screen-popover-updating"
      data-trace-source="src/design/screens/PopoverUpdatingScreen.tsx"
    >
      <PopoverStage toolsState="installing">
        <ToolsPopover state="updating" />
      </PopoverStage>
    </DesignScreen>
  );
}
