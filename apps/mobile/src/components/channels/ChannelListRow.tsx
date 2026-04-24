import { memo, useCallback } from "react";
import { useRouter } from "expo-router";
import ContextMenu from "react-native-context-menu-view";
import { useEntityField } from "@trace/client-core";
import { ListRow } from "@/components/design-system";
import { useChannelRowMenu } from "./useChannelRowMenu";

export interface ChannelListRowProps {
  channelId: string;
  activeCount: number;
}

// Without an onLongPress prop on the inner Pressable, a long press can fall
// through to the row tap instead of handing control to the native menu.
const noop = () => {};

export const ChannelListRow = memo(function ChannelListRow({
  channelId,
  activeCount,
}: ChannelListRowProps) {
  const router = useRouter();
  const name = useEntityField("channels", channelId, "name");
  const { actions, onPress: onMenuPress } = useChannelRowMenu({
    channelId,
    channelName: name ?? "this channel",
  });

  const handlePress = useCallback(() => {
    router.push(`/channels/${channelId}`);
  }, [router, channelId]);

  if (!name) return null;

  return (
    <ContextMenu actions={actions} onPress={onMenuPress} preview={null}>
      <ListRow
        title={name}
        subtitle={formatSubtitle(activeCount)}
        onPress={handlePress}
        onLongPress={noop}
        disclosureIndicator
      />
    </ContextMenu>
  );
});

function formatSubtitle(activeCount: number): string {
  if (activeCount === 0) return "No active sessions";
  if (activeCount === 1) return "1 active session";
  return `${activeCount} active sessions`;
}
