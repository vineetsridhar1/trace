import {
  ARCHIVE_SESSION_GROUP_MUTATION,
  useAuthStore,
  useEntityStore,
} from "@trace/client-core";
import { toast } from "sonner";
import { client } from "./urql";

const pendingArchives = new Set<string>();

export function archiveSessionGroup(groupId: string, groupName: string) {
  if (pendingArchives.has(groupId)) return;
  pendingArchives.add(groupId);
  let cancelled = false;
  let started = false;
  const { user, activeOrgId } = useAuthStore.getState();
  const sessionGroup = useEntityStore.getState().sessionGroups[groupId];
  useEntityStore.getState().remove("sessionGroups", groupId);

  const restore = () => {
    if (!sessionGroup || useEntityStore.getState().sessionGroups[groupId]) return;
    useEntityStore.getState().upsert("sessionGroups", groupId, sessionGroup);
  };

  const cancel = (restoreSessionGroup = false) => {
    if (cancelled || started) return;
    cancelled = true;
    pendingArchives.delete(groupId);
    unsubscribe();
    if (restoreSessionGroup) restore();
  };

  const archive = async () => {
    if (cancelled || started) return;
    started = true;
    unsubscribe();
    try {
      const result = await client
        .mutation(ARCHIVE_SESSION_GROUP_MUTATION, { id: groupId })
        .toPromise();
      if (result.error) throw result.error;
    } catch (error) {
      restore();
      toast.error("Failed to archive workspace", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      pendingArchives.delete(groupId);
    }
  };

  const unsubscribe = useAuthStore.subscribe((state) => {
    if (state.user?.id !== user?.id || state.activeOrgId !== activeOrgId || state.loading) {
      cancel();
      toast.dismiss(toastId);
    }
  });

  // Archiving can delete empty workspaces and unload worktrees, so Undo must run first.
  const toastId = toast(`Archiving “${groupName}”`, {
    duration: 8000,
    action: {
      label: "Undo",
      onClick: () => cancel(true),
    },
    onAutoClose: archive,
    onDismiss: archive,
  });
}
