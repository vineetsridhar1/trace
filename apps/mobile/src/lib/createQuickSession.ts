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
import type { CodingTool, HostingMode } from "@trace/gql";
import { getClient } from "@/lib/urql";
import { haptic } from "@/lib/haptics";
import { closeSessionPlayer, tryOpenSessionPlayer } from "@/lib/sessionPlayer";
import { useMobileUIStore } from "@/stores/ui";

const DEFAULT_TOOL: CodingTool = "claude_code";
// Mobile has no preferences store yet, so the create path always routes to
// cloud. TODO(mobile-v1): once ticket 36 lands a preferences store, honor a
// connected local bridge the same way web's `resolveDefaultRuntime` does.
const DEFAULT_HOSTING: HostingMode = "cloud";

/**
 * Mobile twin of web's `createQuickSession`: inserts optimistic session
 * entities, opens the Session Player (§10.8) overlay pointed at the temp
 * session, and fires the real mutation in the background. When the server
 * responds, the temp entities are swapped for the real ones and the
 * overlay's target session id is updated in place — so the user can start
 * typing before the round-trip completes.
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

    // Swap entities first, then retarget the overlay so the SessionSurface
    // never dereferences a deleted temp id. React batches these updates.
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
    }
  } catch (err) {
    rollbackOptimisticSessionPair({ tempSessionId, tempGroupId });
    // Only collapse the Player if it's still pointed at the temp session —
    // the user may have swiped it away and tapped into an unrelated session
    // while the mutation was in flight.
    const ui = useMobileUIStore.getState();
    if (ui.overlaySessionId === tempSessionId) {
      closeSessionPlayer();
      ui.setOverlaySessionId(null);
    }
    const message = err instanceof Error ? err.message : "Please try again.";
    void haptic.error();
    Alert.alert("Couldn't start session", message);
  }
}
