import { useCallback, useMemo } from "react";
import { type NativeSyntheticEvent } from "react-native";
import * as Clipboard from "expo-clipboard";
import { ARCHIVE_SESSION_GROUP_MUTATION } from "@trace/client-core";
import {
  type ContextMenuAction,
  type ContextMenuOnPressNativeEvent,
} from "react-native-context-menu-view";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";

export function useApplicationRowMenu(
  groupId: string,
  isArchived: boolean,
): {
  actions: ContextMenuAction[];
  onPress: (event: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>) => void;
} {
  const handleArchive = useCallback(async () => {
    void haptic.medium();
    const result = await getClient()
      .mutation(ARCHIVE_SESSION_GROUP_MUTATION, { id: groupId })
      .toPromise();
    if (result.error) {
      void haptic.error();
      console.warn("[archiveSessionGroup] failed", result.error);
    }
  }, [groupId]);

  const handleCopyLink = useCallback(async () => {
    await Clipboard.setStringAsync(`trace://sessions/${groupId}`);
    void haptic.light();
  }, [groupId]);

  const actions = useMemo<ContextMenuAction[]>(() => {
    const items: ContextMenuAction[] = [];
    if (!isArchived) {
      items.push({ title: "Archive application", systemIcon: "archivebox", destructive: true });
    }
    items.push({ title: "Copy link", systemIcon: "link" });
    return items;
  }, [isArchived]);

  const onPress = useCallback(
    (event: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>) => {
      const index = event.nativeEvent.index;
      if (!isArchived && index === 0) {
        void handleArchive();
        return;
      }
      if (index === (isArchived ? 0 : 1)) void handleCopyLink();
    },
    [handleArchive, handleCopyLink, isArchived],
  );

  return { actions, onPress };
}
