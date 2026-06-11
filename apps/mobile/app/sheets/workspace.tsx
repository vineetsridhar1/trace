import { useLocalSearchParams } from "expo-router";
import { Sheet } from "@/components/design-system";
import { WorkspacePanelSheetContent } from "@/components/sessions/WorkspacePanelSheetContent";

export default function WorkspaceSheetScreen() {
  const { groupId, sessionId } = useLocalSearchParams<{
    groupId: string;
    sessionId?: string;
  }>();

  return (
    <Sheet detents={["large"]} showGrabber={false} padding="xs">
      <WorkspacePanelSheetContent groupId={groupId} sessionId={sessionId} />
    </Sheet>
  );
}
