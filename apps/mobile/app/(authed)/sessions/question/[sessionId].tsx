import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { PendingInputQuestion } from "@/components/sessions/PendingInputQuestion";
import { TraceLoader } from "@/components/design-system";
import { useSessionPendingInput } from "@/hooks/useSessionPendingInput";
import { useTheme } from "@/theme";

export default function SessionQuestionScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const pending = useSessionPendingInput(sessionId);
  const close = () => router.back();
  if (!pending || pending.kind !== "question") {
    return <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: "center", justifyContent: "center" }}><TraceLoader size="small" color="mutedForeground" /></View>;
  }
  return <PendingInputQuestion sessionId={sessionId} questions={pending.questions} hasActivePlan={pending.hasActivePlan} onClose={close} />;
}
