import { useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/design-system";
import { ConnectionsBridgesList } from "@/components/connections/ConnectionsBridgesList";

export default function ConnectionsScreen() {
  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  return (
    <Screen edges={["left", "right"]}>
      <ConnectionsBridgesList initialReviewRequestId={requestId} />
    </Screen>
  );
}
