import { timeAgo } from "../../lib/utils";

export function SessionLastActivityCell({ value }: { value?: string }) {
  if (!value) return null;

  return <span className="text-xs text-muted-foreground">{timeAgo(value)}</span>;
}
