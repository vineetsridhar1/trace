import { Circle, Loader2, XCircle, StopCircle } from "lucide-react";

export function AgentStatusIcon({ agentStatus, size, className }: { agentStatus: string; size: number; className?: string }) {
  switch (agentStatus) {
    case "active":
      return <Loader2 size={size} className={`animate-spin ${className ?? ""}`} />;
    case "done":
    case "not_started":
      return <Circle size={Math.max(size - 4, 4)} className={`fill-current ${className ?? ""}`} />;
    case "failed":
      return <XCircle size={size} className={className} />;
    case "stopped":
      return <StopCircle size={size} className={className} />;
    default:
      return <Circle size={Math.max(size - 4, 4)} className={`fill-current ${className ?? ""}`} />;
  }
}
