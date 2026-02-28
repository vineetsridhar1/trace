import { useEffect, useRef, useState } from 'react';
import { gql, useSubscription } from '@apollo/client';
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

interface UseChannelMessageNotificationsOptions {
  activeServerId: string;
  activeChannelId: string | null;
  activeAiChatId: string | null;
  serverChannels: Channel[];
}

export function useChannelMessageNotifications({
  activeServerId,
  activeChannelId,
  activeAiChatId,
  serverChannels,
}: UseChannelMessageNotificationsOptions) {
  const { user } = useAuth();
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const prevServerIdRef = useRef(activeServerId);

  // Reset counts when server changes
  useEffect(() => {
    if (activeServerId !== prevServerIdRef.current) {
      setUnreadCounts({});
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

  // Build a set of channel IDs for fast lookup
  const channelIdsRef = useRef(new Set<string>());
  useEffect(() => {
    channelIdsRef.current = new Set(serverChannels.map((ch) => ch.id));
  }, [serverChannels]);

  useEffect(() => {
    if (!subData?.channelMessageCreatedInServer) return;
    const msg = subData.channelMessageCreatedInServer;

    // Skip own messages
    if (msg.author.id === user?.id) return;

    // Skip channels not in sidebar
    if (!channelIdsRef.current.has(msg.channelId)) return;

    const isViewingChannel = msg.channelId === activeChannelId && !activeAiChatId;

    // Increment unread count for non-active channels
    if (!isViewingChannel) {
      setUnreadCounts((prev) => ({
        ...prev,
        [msg.channelId]: (prev[msg.channelId] ?? 0) + 1,
      }));
    }

    // Show Mac notification if app not focused or message is for a non-active channel
    if ((!document.hasFocus() || !isViewingChannel) && 'Notification' in window && Notification.permission === 'granted') {
      const channel = serverChannels.find((ch) => ch.id === msg.channelId);
      const channelName = channel?.name ?? 'unknown';
      const notification = new Notification(`${msg.author.name} in #${channelName}`, {
        body: msg.content,
      });
      notification.onclick = () => {
        void window.traceAPI.focusWindow();
      };
    }
  }, [subData, user?.id, activeChannelId, activeAiChatId, serverChannels]);

  return { unreadCounts };
}
