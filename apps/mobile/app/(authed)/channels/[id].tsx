import { useLocalSearchParams } from "expo-router";
import { Screen, Text } from "@/components/design-system";

export default function ChannelDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen>
      <Text variant="body" color="mutedForeground" style={{ padding: 16 }}>
        Coding channel {id} (ticket 17)
      </Text>
    </Screen>
  );
}
