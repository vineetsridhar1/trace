import { useLocalSearchParams } from "expo-router";
import { Sheet } from "@/components/design-system";
import { WorkspaceDiffPreviewContent } from "@/components/sessions/WorkspacePanelSheetContent";

export default function WorkspaceDiffSheetScreen() {
  const { groupId, filePath, status, additions, deletions } = useLocalSearchParams<{
    groupId: string;
    filePath: string;
    status?: string;
    additions?: string;
    deletions?: string;
  }>();

  return (
    <Sheet
      detents={["large"]}
      showGrabber={false}
      padding="xs"
      style={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }}
    >
      <WorkspaceDiffPreviewContent
        groupId={groupId}
        file={{
          path: filePath,
          status: status ?? "M",
          additions: Number(additions ?? 0),
          deletions: Number(deletions ?? 0),
        }}
      />
    </Sheet>
  );
}
