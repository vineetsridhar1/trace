import { CREATE_TERMINAL_MUTATION, generateUUID } from "@trace/client-core";
import { client } from "./urql";
import {
  useTerminalStore,
  type TerminalCreationIntent,
} from "../stores/terminal";

type TerminalCreationRequest = Omit<
  TerminalCreationIntent,
  "createdAt" | "creationIntentId"
>;

export function requestSessionTerminal(input: TerminalCreationRequest): {
  clientMutationId: string;
  completion: Promise<string>;
} {
  const clientMutationId = generateUUID();
  useTerminalStore.getState().registerTerminalCreationIntent(clientMutationId, {
    ...input,
    createdAt: Date.now(),
  });

  const completion = (async () => {
    try {
      const result = await client
        .mutation(CREATE_TERMINAL_MUTATION, {
          sessionId: input.sessionId,
          cols: 80,
          rows: 24,
          clientMutationId,
        })
        .toPromise();
      if (result.error) throw result.error;
      const terminalId = result.data?.createTerminal?.id;
      if (!terminalId) throw new Error("Server did not return a terminal ID");
      return terminalId;
    } catch (error: unknown) {
      useTerminalStore.getState().cancelTerminalCreationIntent(clientMutationId);
      throw error;
    }
  })();

  return { clientMutationId, completion };
}
