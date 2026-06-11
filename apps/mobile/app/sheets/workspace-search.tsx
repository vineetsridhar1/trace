import { useLocalSearchParams } from "expo-router";
import { Sheet } from "@/components/design-system";
import { WorkspaceFileSearchContent } from "@/components/sessions/WorkspacePanelSheetContent";

export default function WorkspaceSearchSheetScreen() {
  const { groupId } = useLocalSearchParams<{
    groupId: string;
  }>();

  return (
    <Sheet
      detents={["large"]}
      showGrabber={false}
      padding="xs"
      style={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }}
    >
      <WorkspaceFileSearchContent groupId={groupId} />
    </Sheet>
  );
}
