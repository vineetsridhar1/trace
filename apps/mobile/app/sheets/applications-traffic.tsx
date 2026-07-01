import { useLocalSearchParams } from "expo-router";
import { Sheet } from "@/components/design-system";
import { EndpointTrafficSheetContent } from "@/components/sessions/EndpointTrafficSheetContent";

export default function ApplicationsTrafficSheetScreen() {
  const { groupId, endpointId } = useLocalSearchParams<{
    groupId: string;
    endpointId?: string;
  }>();

  return (
    <Sheet
      detents={["large"]}
      showGrabber={false}
      padding="xs"
      style={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }}
    >
      <EndpointTrafficSheetContent groupId={groupId} endpointId={endpointId} />
    </Sheet>
  );
}
