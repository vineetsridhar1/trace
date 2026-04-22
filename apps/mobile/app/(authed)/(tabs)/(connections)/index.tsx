import { Screen } from "@/components/design-system";
import { ConnectionsBridgesList } from "@/components/connections/ConnectionsBridgesList";

export default function ConnectionsScreen() {
  return (
    <Screen edges={["left", "right"]}>
      <ConnectionsBridgesList />
    </Screen>
  );
}
