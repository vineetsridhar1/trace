import { useCallback, useState } from "react";
import { gql } from "@urql/core";
import { useSessionEvents } from "../../hooks/useSessionEvents";
import { SessionMessageList } from "./SessionMessageList";
import { SessionHeader } from "./SessionHeader";
import { SessionInput } from "./SessionInput";
import { client } from "../../lib/urql";

const RUN_SESSION_MUTATION = gql`
  mutation RunSession($id: ID!, $prompt: String) {
    runSession(id: $id, prompt: $prompt) {
      id
    }
  }
`;

const TERMINATE_SESSION_MUTATION = gql`
  mutation TerminateSession($id: ID!) {
    terminateSession(id: $id) {
      id
    }
  }
`;

export function SessionDetailView({ sessionId }: { sessionId: string }) {
  const { eventIds, loading } = useSessionEvents(sessionId);
  const [running, setRunning] = useState(false);

  const handleRun = useCallback(async () => {
    setRunning(true);
    try {
      await client.mutation(RUN_SESSION_MUTATION, { id: sessionId }).toPromise();
    } finally {
      setRunning(false);
    }
  }, [sessionId]);

  const handleStop = useCallback(async () => {
    await client.mutation(TERMINATE_SESSION_MUTATION, { id: sessionId }).toPromise();
  }, [sessionId]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SessionHeader
        sessionId={sessionId}
        running={running}
        onRun={handleRun}
        onStop={handleStop}
      />

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading events...</p>
        </div>
      ) : (
        <SessionMessageList eventIds={eventIds} />
      )}

      <SessionInput sessionId={sessionId} />
    </div>
  );
}
