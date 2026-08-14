import { personInitials } from "../../lib/person-identity";
import { cn } from "../../lib/utils";

export function PersonAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  className?: string;
}) {
  if (avatarUrl) {
    return (
      <img src={avatarUrl} alt="" className={cn("h-8 w-8 shrink-0 rounded-full", className)} />
    );
  }

  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[11px] font-medium text-muted-foreground",
        className,
      )}
    >
      {personInitials(name)}
    </span>
  );
}
