import { useEntityField } from "../../stores/entity";
import { useAuthStore } from "../../stores/auth";
import { UserProfileChatCard } from "../shared/UserProfileChatCard";

interface UserMentionProps {
  userId: string;
  fallbackName?: string;
}

export function UserMention({ userId, fallbackName }: UserMentionProps) {
  const name = useEntityField("users", userId, "name");
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isMe = userId === currentUserId;

  const displayName = (name as string | undefined) ?? fallbackName ?? "Unknown";

  return (
    <UserProfileChatCard userId={userId} fallbackName={fallbackName}>
      <span
        className={`inline cursor-pointer font-medium hover:underline ${
          isMe ? "text-blue-300" : "text-blue-300"
        }`}
      >
        @{displayName}
      </span>
    </UserProfileChatCard>
  );
}
