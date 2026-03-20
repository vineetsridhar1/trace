import type { ReactNode } from "react";
import { getInitials } from "../../lib/utils";
import { useEntityField } from "../../stores/entity";
import { EntityPreview, type EntityPreviewMode } from "./EntityPreview";
import { EntityPreviewCard } from "./EntityPreviewCard";

interface UserProfileCardProps {
  userId: string;
  fallbackName?: string;
  fallbackAvatarUrl?: string | null;
  children: ReactNode;
  footer?: ReactNode;
  mode?: EntityPreviewMode;
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
  mode = "hover",
}: UserProfileCardProps) {
  const name = useEntityField("users", userId, "name");
  const avatarUrl = useEntityField("users", userId, "avatarUrl");
  const email = useEntityField("users", userId, "email");
  const role = useEntityField("users", userId, "role");

  const displayName = (name as string | undefined) ?? fallbackName ?? "Unknown";
  const displayAvatar = (avatarUrl as string | undefined) ?? fallbackAvatarUrl ?? undefined;
  const displayEmail = email as string | undefined;
  const displayRole = role as string | undefined;
  const avatar = displayAvatar ? (
    <img
      src={displayAvatar}
      alt={displayName}
      className="h-14 w-14 shrink-0 rounded-lg object-cover"
    />
  ) : (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted text-xl font-bold text-muted-foreground">
      {getInitials(displayName)}
    </div>
  );

  return (
    <EntityPreview
      mode={mode}
      side="top"
      align="start"
      contentClassName="w-72 gap-0 p-0"
      content={
        <EntityPreviewCard
          media={avatar}
          title={displayName}
          subtitle={displayRole}
          description={displayEmail}
          footer={footer}
        />
      }
    >
      {children}
    </EntityPreview>
  );
}
