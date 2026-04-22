import { memo, useCallback } from "react";
import { useRouter } from "expo-router";
import { useEntityField } from "@trace/client-core";
import { ListRow } from "@/components/design-system";

export interface ChannelListRowProps {
  channelId: string;
  activeCount: number;
}

export const ChannelListRow = memo(function ChannelListRow({
  channelId,
  activeCount,
}: ChannelListRowProps) {
  const router = useRouter();
  const name = useEntityField("channels", channelId, "name");

  const handlePress = useCallback(() => {
    router.push(`/channels/${channelId}`);
  }, [router, channelId]);

  if (!name) return null;

  return (
    <ListRow
      title={name}
      subtitle={formatSubtitle(activeCount)}
      onPress={handlePress}
      disclosureIndicator
    />
  );
});

function formatSubtitle(activeCount: number): string {
  if (activeCount === 0) return "No active sessions";
  if (activeCount === 1) return "1 active session";
  return `${activeCount} active sessions`;
}
