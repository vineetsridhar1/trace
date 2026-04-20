import { memo, useCallback } from "react";
import { useRouter } from "expo-router";
import { ListRow } from "@/components/design-system";

export interface ChannelListRowProps {
  channelId: string;
  name: string;
  subtitle: string;
}

export const ChannelListRow = memo(function ChannelListRow({
  channelId,
  name,
  subtitle,
}: ChannelListRowProps) {
  const router = useRouter();
  const handlePress = useCallback(() => {
    router.push(`/channels/${channelId}`);
  }, [router, channelId]);

  return (
    <ListRow
      title={name}
      subtitle={subtitle}
      onPress={handlePress}
      disclosureIndicator
    />
  );
});
