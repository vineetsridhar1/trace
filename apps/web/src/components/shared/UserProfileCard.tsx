import { useCallback } from "react";
import { MessageSquare } from "lucide-react";
import { gql } from "@urql/core";
import { client } from "../../lib/urql";
import { useEntityField, useEntityStore } from "../../stores/entity";
import { useAuthStore } from "../../stores/auth";
import { useUIStore } from "../../stores/ui";
import { Button } from "../ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../ui/hover-card";
import type { Chat } from "@trace/gql";

const CREATE_CHAT_MUTATION = gql`
  mutation CreateDM($input: CreateChatInput!) {
    createChat(input: $input) {
      id
      type
      name
      members {
        user {
          id
          name
          avatarUrl
        }
        joinedAt
      }
      createdAt
      updatedAt
    }
  }
`;

interface UserProfileCardProps {
  userId: string;
  fallbackName?: string;
  fallbackAvatarUrl?: string | null;
  children: React.ReactNode;
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
}: UserProfileCardProps) {
  const name = useEntityField("users", userId, "name");
  const avatarUrl = useEntityField("users", userId, "avatarUrl");
  const email = useEntityField("users", userId, "email");
  const role = useEntityField("users", userId, "role");
  const currentUserId = useAuthStore((s) => s.user?.id);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const setActiveChatId = useUIStore((s) => s.setActiveChatId);
  const isMe = userId === currentUserId;

  const displayName = (name as string | undefined) ?? fallbackName ?? "Unknown";
  const displayAvatar = (avatarUrl as string | undefined) ?? fallbackAvatarUrl ?? undefined;
  const displayEmail = email as string | undefined;
  const displayRole = role as string | undefined;

  const handleChat = useCallback(async () => {
    if (!activeOrgId || !currentUserId || isMe) return;

    const result = await client
      .mutation(CREATE_CHAT_MUTATION, {
        input: {
          organizationId: activeOrgId,
          memberIds: [userId],
        },
      })
      .toPromise();

    if (result.data?.createChat) {
      const chat = result.data.createChat as Chat;
      useEntityStore.getState().upsert("chats", chat.id, chat);
      setActiveChatId(chat.id);
    }
  }, [activeOrgId, currentUserId, userId, isMe, setActiveChatId]);

  return (
    <HoverCard>
      <HoverCardTrigger render={<span className="cursor-pointer" />}>
        {children}
      </HoverCardTrigger>
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
              <span className="truncate text-base font-bold text-foreground">
                {displayName}
              </span>
            </div>
            {displayRole && (
              <span className="text-xs capitalize text-muted-foreground">{displayRole}</span>
            )}
            {displayEmail && (
              <p className="truncate text-xs text-muted-foreground">{displayEmail}</p>
            )}
          </div>
        </div>

        {/* Divider + actions */}
        {!isMe && (
          <>
            <div className="border-t border-border" />
            <div className="p-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={handleChat}
              >
                <MessageSquare size={14} />
                Chat
              </Button>
            </div>
          </>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
