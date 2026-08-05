import type { ReactNode } from "react";
import { SidebarFooter, type ToolsRowState } from "./AppChrome";

const SOURCE = "src/design/components/PopoverStage.tsx";

/** Bottom of the real sidebar, so each popover state is shown on its own anchor. */
const tailNav = ["Documents", "Animations", "wavelength", "In Progress"];

type PopoverStageProps = {
  children: ReactNode;
  toolsState: ToolsRowState;
};

export function PopoverStage({ children, toolsState }: PopoverStageProps) {
  return (
    <div
      data-trace-id="popover-stage"
      data-trace-source={SOURCE}
      className="relative h-full overflow-hidden bg-design-background"
    >
      <div
        data-trace-id="popover-stage-sidebar"
        data-trace-source={SOURCE}
        className="absolute bottom-0 left-0 top-0 flex w-[252px] flex-col justify-end border-r border-design-border bg-design-surface"
      >
        <div
          data-trace-id="popover-stage-nav-tail"
          data-trace-source={SOURCE}
          aria-hidden="true"
          className="px-2 pb-2"
        >
          {tailNav.map((label, index) => (
            <p
              key={label}
              className="truncate rounded-design-control px-2 py-2 text-[13px] text-design-muted"
              style={{ opacity: 0.2 + index * 0.16 }}
            >
              {label}
            </p>
          ))}
        </div>
        <SidebarFooter toolsState={toolsState} toolsActive />
      </div>
      <div
        data-trace-id="popover-stage-layer"
        data-trace-source={SOURCE}
        className="absolute bottom-[108px] left-2 z-10 w-[296px]"
      >
        {children}
      </div>
    </div>
  );
}
