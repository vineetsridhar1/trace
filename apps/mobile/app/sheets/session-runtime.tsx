import { useLocalSearchParams } from "expo-router";
import { Sheet } from "@/components/design-system";
import { SessionRuntimePickerSheetContent } from "@/components/sessions/SessionRuntimePickerSheetContent";

export default function SessionRuntimeSheetScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();

  if (!sessionId) return null;

  return (
    <Sheet detents={["small", "medium"]}>
      <SessionRuntimePickerSheetContent sessionId={sessionId} />
    </Sheet>
  );
}
