import type { ReactNode } from "react";
import { useAuthStore } from "../../stores/auth";
import { UserProfileCard } from "./UserProfileCard";
import { StartDirectMessageButton } from "./StartDirectMessageButton";

interface UserProfileChatCardProps {
  userId: string;
  fallbackName?: string;
  fallbackAvatarUrl?: string | null;
  children: ReactNode;
}

export function UserProfileChatCard({
  userId,
  fallbackName,
  fallbackAvatarUrl,
  children,
}: UserProfileChatCardProps) {
  const currentUserId = useAuthStore((s) => s.user?.id);

  return (
    <UserProfileCard
      userId={userId}
      fallbackName={fallbackName}
      fallbackAvatarUrl={fallbackAvatarUrl}
      footer={userId === currentUserId ? undefined : <StartDirectMessageButton userId={userId} />}
    >
      {children}
    </UserProfileCard>
  );
}
