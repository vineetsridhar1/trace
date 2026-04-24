import { useLocalSearchParams } from "expo-router";
import { Sheet } from "@/components/design-system";
import { SessionModelPickerSheetContent } from "@/components/sessions/SessionModelPickerSheetContent";

export default function SessionModelSheetScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();

  if (!sessionId) return null;

  return (
    <Sheet detents={["small", "medium"]}>
      <SessionModelPickerSheetContent sessionId={sessionId} />
    </Sheet>
  );
}
