import { useLocalSearchParams } from "expo-router";
import { Sheet } from "@/components/design-system";
import { WorkspaceFilePreviewContent } from "@/components/sessions/WorkspacePanelSheetContent";

export default function WorkspaceFileSheetScreen() {
  const { groupId, filePath } = useLocalSearchParams<{
    groupId: string;
    filePath: string;
  }>();

  return (
    <Sheet
      detents={["large"]}
      showGrabber={false}
      padding="xs"
      style={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }}
    >
      <WorkspaceFilePreviewContent groupId={groupId} filePath={filePath} />
    </Sheet>
  );
}
