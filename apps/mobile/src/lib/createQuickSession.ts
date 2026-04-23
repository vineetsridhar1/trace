import { router } from "expo-router";
import { Alert } from "react-native";
import {
  generateUUID,
  insertOptimisticSessionPair,
  reconcileOptimisticSessionPair,
  rollbackOptimisticSessionPair,
  START_SESSION_MUTATION,
  useEntityStore,
} from "@trace/client-core";
import { getDefaultModel } from "@trace/shared";
import type { CodingTool } from "@trace/gql";
import { getClient } from "@/lib/urql";
import { haptic } from "@/lib/haptics";
import { closeSessionPlayer, tryOpenSessionPlayer } from "@/lib/sessionPlayer";
import { useMobileUIStore } from "@/stores/ui";

const DEFAULT_TOOL: CodingTool = "claude_code";
// Mobile only supports local sessions for now. The server resolves the
// caller's default accessible local runtime when no explicit runtime id is
// provided.
const DEFAULT_HOSTING = "local";

/**
 * Mobile twin of web's `createQuickSession`: inserts optimistic session
 * entities, routes to the temp session page, and fires the real mutation
 * in the background. When the server responds, the temp entities are
 * swapped for the real ones and the route is updated in place.
 */
export async function createQuickSession(channelId: string): Promise<void> {
  const channel = useEntityStore.getState().channels[channelId];
  const channelRepoId = channel?.repo?.id;

  const tempSessionId = generateUUID();
  const tempGroupId = generateUUID();
  const tool = DEFAULT_TOOL;
  const model = getDefaultModel(tool);
  const hosting = DEFAULT_HOSTING;

  insertOptimisticSessionPair({
    tempSessionId,
    tempGroupId,
    tool,
    model,
    hosting,
    channelId,
    repoId: channelRepoId,
  });
  void haptic.light();
  tryOpenSessionPlayer(tempSessionId);

  try {
    const result = await getClient()
      .mutation<{ startSession: { id: string; sessionGroupId: string } }>(
        START_SESSION_MUTATION,
        {
          input: {
            tool,
            model,
            hosting,
            channelId,
            repoId: channelRepoId,
          },
        },
      )
      .toPromise();
    if (result.error) throw result.error;
    const session = result.data?.startSession;
    if (!session?.id || !session.sessionGroupId) {
      throw new Error("Server did not return a session id");
    }

    // Swap entities first, then retarget the route so the page never
    // dereferences a deleted temp id. React batches these updates.
    reconcileOptimisticSessionPair({
      tempSessionId,
      tempGroupId,
      realSessionId: session.id,
      realGroupId: session.sessionGroupId,
      tool,
      model,
      hosting,
      channelId,
      repoId: channelRepoId,
    });
    const ui = useMobileUIStore.getState();
    if (ui.overlaySessionId === tempSessionId) {
      ui.setOverlaySessionId(session.id);
      router.replace(`/sessions/${session.sessionGroupId}/${session.id}` as never);
    }
  } catch (err) {
    rollbackOptimisticSessionPair({ tempSessionId, tempGroupId });
    // Only close the routed session view if it's still pointed at the temp
    // session — the user may have navigated elsewhere while the mutation
    // was in flight.
    const ui = useMobileUIStore.getState();
    if (ui.overlaySessionId === tempSessionId) {
      closeSessionPlayer();
    }
    const message = err instanceof Error ? err.message : "Please try again.";
    void haptic.error();
    Alert.alert("Couldn't start session", message);
  }
}
