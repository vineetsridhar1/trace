import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

type Props = {
  children: string;
  tooltip: string;
};

export function AgentEnvironmentFieldLabel({ children, tooltip }: Props) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      {children}
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          <Info size={13} className="text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent side="right">{tooltip}</TooltipContent>
      </Tooltip>
    </span>
  );
}
