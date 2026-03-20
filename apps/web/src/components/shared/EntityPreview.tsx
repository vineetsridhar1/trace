import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export type EntityPreviewMode = "hover" | "popover";

type PreviewSide = React.ComponentProps<typeof HoverCardContent>["side"];
type PreviewAlign = React.ComponentProps<typeof HoverCardContent>["align"];

interface EntityPreviewProps {
  children: ReactNode;
  content: ReactNode;
  mode?: EntityPreviewMode;
  side?: PreviewSide;
  align?: PreviewAlign;
  sideOffset?: number;
  alignOffset?: number;
  triggerClassName?: string;
  contentClassName?: string;
  disabled?: boolean;
}

export function EntityPreview({
  children,
  content,
  mode = "hover",
  side = "top",
  align = "start",
  sideOffset = 4,
  alignOffset = 4,
  triggerClassName,
  contentClassName,
  disabled = false,
}: EntityPreviewProps) {
  if (disabled) {
    return <>{children}</>;
  }

  const trigger = <span className={cn("cursor-pointer", triggerClassName)}>{children}</span>;

  if (mode === "popover") {
    return (
      <Popover>
        <PopoverTrigger render={trigger} nativeButton={false} />
        <PopoverContent
          side={side}
          align={align}
          sideOffset={sideOffset}
          alignOffset={alignOffset}
          className={contentClassName}
        >
          {content}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <HoverCard>
      <HoverCardTrigger
        render={trigger}
        delay={150}
        closeDelay={100}
      />
      <HoverCardContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className={contentClassName}
      >
        {content}
      </HoverCardContent>
    </HoverCard>
  );
}
