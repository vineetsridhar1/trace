import { Circle, XCircle } from "lucide-react";
import { TraceLoader } from "../ui/trace-loader";

export function AgentStatusIcon({
  agentStatus,
  size,
  className,
}: {
  agentStatus: string;
  size: number;
  className?: string;
}) {
  switch (agentStatus) {
    case "preparing":
    case "active":
      return <TraceLoader size={size} showLabel={false} className={className} />;
    case "failed":
      return <XCircle size={size} className={className} />;
    default:
      return <Circle size={size} className={`fill-current ${className ?? ""}`} />;
  }
}
