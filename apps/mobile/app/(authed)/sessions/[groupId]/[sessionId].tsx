import { useLocalSearchParams } from "expo-router";
import { Screen, Text } from "@/components/design-system";

export default function SessionStreamScreen() {
  const { groupId, sessionId } = useLocalSearchParams<{
    groupId: string;
    sessionId: string;
  }>();
  return (
    <Screen>
      <Text variant="body" color="mutedForeground" style={{ padding: 16 }}>
        Session stream {sessionId} in group {groupId} (ticket 20)
      </Text>
    </Screen>
  );
}
