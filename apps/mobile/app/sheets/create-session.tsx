import { useLocalSearchParams } from "expo-router";
import { Sheet } from "@/components/design-system";
import { CreateSessionSheet } from "@/components/sessions/CreateSessionSheet";

export default function CreateSessionSheetScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  if (!channelId) return null;
  return (
    <Sheet detents={["large"]}>
      <CreateSessionSheet channelId={channelId} />
    </Sheet>
  );
}
