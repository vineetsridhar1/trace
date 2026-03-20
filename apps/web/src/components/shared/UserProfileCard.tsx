import type { ReactNode } from "react";
import { useEntityField } from "../../stores/entity";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";

interface UserProfileCardProps {
  userId: string;
  fallbackName?: string;
  fallbackAvatarUrl?: string | null;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Slack-style user profile hover card.
 * Wrap any clickable element (avatar, name, mention) with this component.
 */
export function UserProfileCard({
  userId,
  fallbackName,
  fallbackAvatarUrl,
  children,
  footer,
}: UserProfileCardProps) {
  const name = useEntityField("users", userId, "name");
  const avatarUrl = useEntityField("users", userId, "avatarUrl");
  const email = useEntityField("users", userId, "email");
  const role = useEntityField("users", userId, "role");

  const displayName = (name as string | undefined) ?? fallbackName ?? "Unknown";
  const displayAvatar = (avatarUrl as string | undefined) ?? fallbackAvatarUrl ?? undefined;
  const displayEmail = email as string | undefined;
  const displayRole = role as string | undefined;

  return (
    <HoverCard>
      <HoverCardTrigger render={<span className="cursor-pointer" />}>{children}</HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-72 p-0">
        {/* Top section — avatar + name */}
        <div className="flex items-center gap-3 p-4">
          {displayAvatar ? (
            <img
              src={displayAvatar}
              alt={displayName}
              className="h-14 w-14 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted text-xl font-bold text-muted-foreground">
              {displayName[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-base font-bold text-foreground">{displayName}</span>
            </div>
            {displayRole && (
              <span className="text-xs capitalize text-muted-foreground">{displayRole}</span>
            )}
            {displayEmail && (
              <p className="truncate text-xs text-muted-foreground">{displayEmail}</p>
            )}
          </div>
        </div>

        {footer ? (
          <>
            <div className="border-t border-border" />
            <div className="p-2">{footer}</div>
          </>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}
