import { PopoverStage } from "../components/PopoverStage";
import { ToolsPopover } from "../components/ToolsPopover";
import { DesignScreen } from "../primitives/DesignScreen";

/**
 * Both updates landed. The sidebar badge is gone and the row reads All tools
 * ready, so the outcome is legible even after the popover is dismissed.
 */
export default function PopoverUpdatedScreen() {
  return (
    <DesignScreen
      data-trace-id="screen-popover-updated"
      data-trace-source="src/design/screens/PopoverUpdatedScreen.tsx"
    >
      <PopoverStage toolsState="ready">
        <ToolsPopover state="updated" />
      </PopoverStage>
    </DesignScreen>
  );
}
