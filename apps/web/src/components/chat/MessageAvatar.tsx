import { UserProfileChatCard } from "../shared/UserProfileChatCard";

interface MessageAvatarProps {
  actorId?: string;
  actorName: string;
  avatarUrl?: string | null;
}

function AvatarImage({
  avatarUrl,
  actorName,
  className,
}: {
  avatarUrl: string;
  actorName: string;
  className: string;
}) {
  return <img src={avatarUrl} alt={actorName} className={className} />;
}

function AvatarInitial({
  actorName,
  className,
}: {
  actorName: string;
  className: string;
}) {
  return (
    <div className={className}>
      {actorName[0]?.toUpperCase()}
    </div>
  );
}

export function MessageAvatar({ actorId, actorName, avatarUrl }: MessageAvatarProps) {
  const imgClass = "mt-0.5 h-9 w-9 shrink-0 rounded-lg";
  const initialClass =
    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground";

  const avatar = avatarUrl ? (
    <AvatarImage avatarUrl={avatarUrl} actorName={actorName} className={imgClass} />
  ) : (
    <AvatarInitial actorName={actorName} className={initialClass} />
  );

  if (actorId) {
    return (
      <UserProfileChatCard
        userId={actorId}
        fallbackName={actorName}
        fallbackAvatarUrl={avatarUrl}
      >
        {avatar}
      </UserProfileChatCard>
    );
  }

  return avatar;
}

export function SmallMessageAvatar({ actorId, actorName, avatarUrl }: MessageAvatarProps) {
  const imgClass = "mt-0.5 h-7 w-7 shrink-0 rounded-md";
  const initialClass =
    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground";

  const avatar = avatarUrl ? (
    <AvatarImage avatarUrl={avatarUrl} actorName={actorName} className={imgClass} />
  ) : (
    <AvatarInitial actorName={actorName} className={initialClass} />
  );

  if (actorId) {
    return (
      <UserProfileChatCard
        userId={actorId}
        fallbackName={actorName}
        fallbackAvatarUrl={avatarUrl}
      >
        {avatar}
      </UserProfileChatCard>
    );
  }

  return avatar;
}
