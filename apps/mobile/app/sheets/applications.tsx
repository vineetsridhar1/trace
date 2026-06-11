import { useLocalSearchParams } from "expo-router";
import { Sheet } from "@/components/design-system";
import { ApplicationsSheetContent } from "@/components/sessions/ApplicationsSheetContent";

export default function ApplicationsSheetScreen() {
  const { groupId, sessionId } = useLocalSearchParams<{
    groupId: string;
    sessionId?: string;
  }>();

  return (
    <Sheet detents={["medium", "large"]}>
      <ApplicationsSheetContent groupId={groupId} sessionId={sessionId} />
    </Sheet>
  );
}
