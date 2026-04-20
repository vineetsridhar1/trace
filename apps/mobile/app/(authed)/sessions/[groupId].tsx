import { useLocalSearchParams } from "expo-router";
import { Screen, Text } from "@/components/design-system";

export default function SessionGroupScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return (
    <Screen>
      <Text variant="body" color="mutedForeground" style={{ padding: 16 }}>
        Session group {groupId} (ticket 19)
      </Text>
    </Screen>
  );
}
