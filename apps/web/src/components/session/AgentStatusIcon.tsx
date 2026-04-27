import { Circle, Loader2, XCircle } from "lucide-react";

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
    case "active":
      return <Loader2 size={size} className={`animate-spin ${className ?? ""}`} />;
    case "failed":
      return <XCircle size={size} className={className} />;
    default:
      return <Circle size={size} className={`fill-current ${className ?? ""}`} />;
  }
}
