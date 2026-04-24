import { SessionSurface } from "@/components/sessions/SessionSurface";
import { useSessionPageContext } from "@/components/sessions/session-page/SessionPageContext";

export default function SessionTabScreen() {
  const { onSelectSession, sessionId } = useSessionPageContext();

  return (
    <SessionSurface
      sessionId={sessionId}
      onSelectSession={onSelectSession}
      hideHeader
    />
  );
}
