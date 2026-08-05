import { PopoverStage } from "../components/PopoverStage";
import { ToolsPopover } from "../components/ToolsPopover";
import { DesignScreen } from "../primitives/DesignScreen";

/**
 * The default state and the one most visits end at: two pending tools, one
 * button, no navigation. Absent tools are one quiet line, not a list.
 */
export default function PopoverUpdatesScreen() {
  return (
    <DesignScreen
      data-trace-id="screen-popover-updates"
      data-trace-source="src/design/screens/PopoverUpdatesScreen.tsx"
    >
      <PopoverStage toolsState="updates">
        <ToolsPopover state="updates" />
      </PopoverStage>
    </DesignScreen>
  );
}
