import type { SessionEntity, SessionGroupEntity } from "@trace/client-core";

type ChannelRef = { id: string } | null | undefined;

type SessionGroupWithRuntimeFields = SessionGroupEntity & {
  channelId?: string | null;
};

type SessionWithRuntimeFields = SessionEntity & {
  channelId?: string | null;
};

export function getSessionChannelId(session: SessionEntity | null | undefined): string | null {
  if (!session) return null;
  const channel = session.channel as ChannelRef;
  const rawSession = session as SessionWithRuntimeFields;
  return channel?.id ?? rawSession.channelId ?? null;
}

export function getSessionGroupChannelId(
  group: SessionGroupEntity | null | undefined,
  sessions?: SessionEntity[],
): string | null {
  if (!group) return null;

  const channel = group.channel as ChannelRef;
  const rawGroup = group as SessionGroupWithRuntimeFields;
  if (channel?.id) return channel.id;
  if (rawGroup.channelId) return rawGroup.channelId;

  if (!sessions) return null;
  for (const session of sessions) {
    const channelId = getSessionChannelId(session);
    if (channelId) return channelId;
  }

  return null;
}
