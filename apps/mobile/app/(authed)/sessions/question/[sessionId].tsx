import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { PendingInputQuestion } from "@/components/sessions/PendingInputQuestion";
import { EmptyState, TraceLoader } from "@/components/design-system";
import { useSessionEvents } from "@/hooks/useSessionEvents";
import { useSessionPendingInput } from "@/hooks/useSessionPendingInput";
import { useTheme } from "@/theme";

export default function SessionQuestionScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const pending = useSessionPendingInput(sessionId);
  const liveQuestion = pending?.kind === "question" ? pending : null;
  const { loading, error, fetchEvents } = useSessionEvents(sessionId);
  const [questionRequest, setQuestionRequest] = useState(liveQuestion);
  const [sending, setSending] = useState(false);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(authed)/(tabs)/(home)" as never);
  }, [router]);

  useEffect(() => {
    if (liveQuestion) setQuestionRequest(liveQuestion);
  }, [liveQuestion]);

  useEffect(() => {
    if (!loading && !error && !liveQuestion && !sending) close();
  }, [close, error, liveQuestion, loading, sending]);

  if (!questionRequest && loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <TraceLoader size="small" color="mutedForeground" />
      </View>
    );
  }
  if (!questionRequest) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: "center" }}>
        <EmptyState
          icon={error ? "exclamationmark.triangle" : "checkmark.circle"}
          title={error ? "Couldn't load questions" : "Questions already answered"}
          subtitle={error ?? "Return to the chat to continue the session."}
          action={{
            label: error ? "Try again" : "Return to chat",
            onPress: error ? () => void fetchEvents() : close,
          }}
        />
      </View>
    );
  }
  return (
    <PendingInputQuestion
      key={questionRequest.eventId}
      sessionId={sessionId}
      questions={questionRequest.questions}
      hasActivePlan={questionRequest.hasActivePlan}
      onClose={close}
      onSendingChange={setSending}
    />
  );
}
