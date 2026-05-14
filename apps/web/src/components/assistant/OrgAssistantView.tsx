import { useEffect, useState } from "react";
import { gql } from "@urql/core";
import { Bot } from "lucide-react";
import type { Session } from "@trace/gql";
import { useAuthStore, useEntityStore } from "@trace/client-core";
import { client } from "../../lib/urql";
import { SessionDetailView } from "../session/SessionDetailView";
import { TraceLoader } from "../ui/trace-loader";

const ORG_ASSISTANT_QUERY = gql`
  query OrgAssistantSession($organizationId: ID!) {
    orgAssistantSession(organizationId: $organizationId) {
      id
      name
      kind
      agentStatus
      sessionStatus
      tool
      model
      reasoningEffort
      hosting
      repo {
        id
        name
        remoteUrl
      }
      branch
      workdir
      prUrl
      worktreeDeleted
      lastUserMessageAt
      lastMessageAt
      connection {
        state
        runtimeInstanceId
        runtimeLabel
        lastError
        retryCount
        canRetry
        canMove
        autoRetryable
      }
      createdBy {
        id
        name
        avatarUrl
      }
      sessionGroupId
      channel {
        id
      }
      queuedMessages {
        id
        sessionId
        text
        imageKeys: attachmentKeys
        interactionMode
        position
        createdAt
      }
      createdAt
      updatedAt
    }
  }
`;

export function OrgAssistantView() {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeOrgId) return;
    setError(null);
    client
      .query(ORG_ASSISTANT_QUERY, { organizationId: activeOrgId })
      .toPromise()
      .then((result) => {
        if (result.error) {
          setError(result.error.message);
          return;
        }
        const session = result.data?.orgAssistantSession as Session | undefined;
        if (!session) return;
        useEntityStore.getState().upsert("sessions", session.id, session);
        setSessionId(session.id);
      });
  }, [activeOrgId]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
        <Bot className="size-4 text-primary" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">Org Assistant</div>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {error ? (
          <div className="flex h-full items-center justify-center text-sm text-destructive">
            {error}
          </div>
        ) : sessionId ? (
          <SessionDetailView sessionId={sessionId} hideHeader />
        ) : (
          <div className="flex h-full items-center justify-center">
            <TraceLoader label="Opening assistant" size={48} />
          </div>
        )}
      </div>
    </div>
  );
}
