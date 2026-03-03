import { useEffect, useRef, useState } from 'react';
import { gql, useSubscription } from '@apollo/client';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import type { Channel } from '../types';

const CHANNEL_MESSAGE_CREATED_IN_SERVER_SUBSCRIPTION = gql`
  subscription ChannelMessageCreatedInServer($serverId: ID!) {
    channelMessageCreatedInServer(serverId: $serverId) {
      id
      channelId
      content
      createdAt
      author {
        id
        name
        avatarUrl
      }
    }
  }
`;

const NOTIFICATION_THROTTLE_MS = 5000;

interface UseChannelMessageNotificationsOptions {
  activeServerId: string;
  activeChannelId: string | null;
  activeAiChatId: string | null;
  serverChannels: Channel[];
  onNavigateToChannel?: (channelId: string) => void;
}

export function useChannelMessageNotifications({
  activeServerId,
  activeChannelId,
  activeAiChatId,
  serverChannels,
  onNavigateToChannel,
}: UseChannelMessageNotificationsOptions) {
  const { user } = useAuth();
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const prevServerIdRef = useRef(activeServerId);
  const activeChannelIdRef = useRef(activeChannelId);
  const activeAiChatIdRef = useRef(activeAiChatId);
  const serverChannelsRef = useRef(serverChannels);
  const lastNotificationTimeRef = useRef<Record<string, number>>({});

  const onNavigateRef = useRef(onNavigateToChannel);
  activeChannelIdRef.current = activeChannelId;
  activeAiChatIdRef.current = activeAiChatId;
  serverChannelsRef.current = serverChannels;
  onNavigateRef.current = onNavigateToChannel;

  // Build a set of channel IDs for fast lookup
  const channelIdsRef = useRef(new Set<string>());
  useEffect(() => {
    channelIdsRef.current = new Set(serverChannels.map((ch) => ch.id));
  }, [serverChannels]);

  // Reset counts when server changes
  useEffect(() => {
    if (activeServerId !== prevServerIdRef.current) {
      setUnreadCounts({});
      lastNotificationTimeRef.current = {};
      prevServerIdRef.current = activeServerId;
    }
  }, [activeServerId]);

  // Clear count when user switches to a channel
  useEffect(() => {
    if (activeChannelId && !activeAiChatId) {
      setUnreadCounts((prev) => {
        if (!prev[activeChannelId]) return prev;
        const next = { ...prev };
        delete next[activeChannelId];
        return next;
      });
    }
  }, [activeChannelId, activeAiChatId]);

  const { data: subData } = useSubscription(CHANNEL_MESSAGE_CREATED_IN_SERVER_SUBSCRIPTION, {
    variables: { serverId: activeServerId },
    skip: !activeServerId,
  });

  useEffect(() => {
    if (!subData?.channelMessageCreatedInServer) return;
    const msg = subData.channelMessageCreatedInServer;

    // Skip own messages
    if (msg.author.id === user?.id) return;

    // Skip channels not in sidebar
    if (!channelIdsRef.current.has(msg.channelId)) return;

    const isViewingChannel = msg.channelId === activeChannelIdRef.current && !activeAiChatIdRef.current;

    // Increment unread count for non-active channels
    if (!isViewingChannel) {
      setUnreadCounts((prev) => ({
        ...prev,
        [msg.channelId]: (prev[msg.channelId] ?? 0) + 1,
      }));
    }

    // Throttle to one notification per channel per 5 seconds
    if (!isViewingChannel) {
      const now = Date.now();
      const lastTime = lastNotificationTimeRef.current[msg.channelId] ?? 0;
      if (now - lastTime >= NOTIFICATION_THROTTLE_MS) {
        lastNotificationTimeRef.current[msg.channelId] = now;
        const channel = serverChannelsRef.current.find((ch) => ch.id === msg.channelId);
        const channelName = channel?.name ?? 'unknown';

        if (document.hasFocus()) {
          // In-app toast when focused but viewing a different channel
          const msgChannelId = msg.channelId;
          toast(msg.author.name, {
            description: msg.content.length > 120 ? msg.content.slice(0, 120) + '…' : msg.content,
            action: {
              label: `#${channelName}`,
              onClick: () => onNavigateRef.current?.(msgChannelId),
            },
          });
        } else if ('Notification' in window && Notification.permission === 'granted') {
          // Native OS notification when app is not focused
          const notification = new Notification(`${msg.author.name} in #${channelName}`, {
            body: msg.content,
          });
          notification.onclick = () => {
            void window.traceAPI.focusWindow();
          };
        }
      }
    }
  }, [subData, user?.id]);

  return { unreadCounts };
}
