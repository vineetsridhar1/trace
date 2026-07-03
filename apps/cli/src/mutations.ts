import {
  QUEUE_SESSION_MESSAGE_MUTATION,
  SEND_SESSION_MESSAGE_MUTATION,
  START_SESSION_MUTATION,
  TERMINATE_SESSION_MUTATION,
  type GqlClient,
} from "@trace/client-core/headless";
import { gql, type DocumentInput } from "@urql/core";
import { createClientRuntime, type ClientRuntime } from "./runtime.js";

// Channel sends have no client-core document yet; text channels take rich
// HTML (sendChannelMessage), coding channels take plain text (sendMessage).
const SEND_CHANNEL_MESSAGE_MUTATION = gql`
  mutation SendChannelMessage($channelId: ID!, $html: String) {
    sendChannelMessage(channelId: $channelId, html: $html) {
      id
    }
  }
`;

const SEND_CODING_CHANNEL_MESSAGE_MUTATION = gql`
  mutation SendCodingChannelMessage($channelId: ID!, $text: String!) {
    sendMessage(channelId: $channelId, text: $text) {
      id
    }
  }
`;

/** Boot a one-shot runtime (no orgEvents subscription), run `fn`, always dispose. */
export async function withGqlClient<T>(
  serverUrl: string,
  fn: (client: GqlClient, runtime: ClientRuntime) => Promise<T>,
): Promise<T> {
  const runtime = createClientRuntime({ serverUrl });
  try {
    await runtime.start({ orgEvents: false });
    return await fn(runtime.gql, runtime);
  } finally {
    await runtime.dispose();
  }
}

async function runMutation<T>(
  client: GqlClient,
  document: DocumentInput,
  variables: Record<string, unknown>,
): Promise<T> {
  const result = await client.mutation(document, variables).toPromise();
  if (result.error) {
    throw new Error(result.error.graphQLErrors[0]?.message ?? result.error.message);
  }
  if (!result.data) {
    throw new Error("Mutation returned no data");
  }
  return result.data as T;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendToChannel(
  client: GqlClient,
  channel: { id: string; type: string },
  text: string,
): Promise<{ id: string }> {
  if (channel.type === "coding") {
    const data = await runMutation<{ sendMessage: { id: string } }>(
      client,
      SEND_CODING_CHANNEL_MESSAGE_MUTATION,
      { channelId: channel.id, text },
    );
    return data.sendMessage;
  }
  const html = `<p>${escapeHtml(text).replace(/\n/g, "<br />")}</p>`;
  const data = await runMutation<{ sendChannelMessage: { id: string } }>(
    client,
    SEND_CHANNEL_MESSAGE_MUTATION,
    { channelId: channel.id, html },
  );
  return data.sendChannelMessage;
}

export interface StartSessionParams {
  repoId?: string;
  branch?: string;
  tool?: string;
  model?: string;
  prompt?: string;
}

export async function startNewSession(
  client: GqlClient,
  params: StartSessionParams,
): Promise<{ id: string; sessionGroupId: string | null }> {
  const input: Record<string, unknown> = {};
  if (params.repoId) input.repoId = params.repoId;
  if (params.branch) input.branch = params.branch;
  if (params.tool) input.tool = params.tool;
  if (params.model) input.model = params.model;
  if (params.prompt) input.prompt = params.prompt;
  const data = await runMutation<{ startSession: { id: string; sessionGroupId: string | null } }>(
    client,
    START_SESSION_MUTATION,
    { input },
  );
  return data.startSession;
}

/** Mirror the web composer: queue while the agent is busy (`active`),
 *  send otherwise. The service handles pending-runtime provisioning itself. */
export async function promptSession(
  client: GqlClient,
  session: { id: string; agentStatus: string },
  text: string,
): Promise<{ id: string; queued: boolean }> {
  if (session.agentStatus === "active") {
    const data = await runMutation<{ queueSessionMessage: { id: string } }>(
      client,
      QUEUE_SESSION_MESSAGE_MUTATION,
      { sessionId: session.id, text },
    );
    return { id: data.queueSessionMessage.id, queued: true };
  }
  const data = await runMutation<{ sendSessionMessage: { id: string } }>(
    client,
    SEND_SESSION_MESSAGE_MUTATION,
    { sessionId: session.id, text },
  );
  return { id: data.sendSessionMessage.id, queued: false };
}

export async function stopSession(client: GqlClient, sessionId: string): Promise<{ id: string }> {
  const data = await runMutation<{ terminateSession: { id: string } }>(
    client,
    TERMINATE_SESSION_MUTATION,
    { id: sessionId },
  );
  return data.terminateSession;
}
