import { useCallback, useMemo } from "react";
import { Alert, type NativeSyntheticEvent } from "react-native";
import { DELETE_CHANNEL_MUTATION } from "@trace/client-core";
import {
  type ContextMenuAction,
  type ContextMenuOnPressNativeEvent,
} from "react-native-context-menu-view";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";

export interface ChannelRowMenuParams {
  channelId: string;
  channelName: string;
}

export interface ChannelRowMenu {
  actions: ContextMenuAction[];
  onPress: (e: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>) => void;
}

export function useChannelRowMenu({
  channelId,
  channelName,
}: ChannelRowMenuParams): ChannelRowMenu {
  const handleDelete = useCallback(async () => {
    void haptic.heavy();
    const result = await getClient()
      .mutation(DELETE_CHANNEL_MUTATION, { id: channelId })
      .toPromise();

    if (result.error) {
      void haptic.error();
      Alert.alert("Couldn't delete channel", result.error.message);
      return;
    }

    void haptic.success();
  }, [channelId]);

  const confirmDelete = useCallback(() => {
    Alert.alert(
      "Delete channel?",
      `Delete ${channelName}? This permanently deletes the channel and all its sessions.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void handleDelete() },
      ],
    );
  }, [channelName, handleDelete]);

  const actions = useMemo<ContextMenuAction[]>(
    () => [{ title: "Delete channel", systemIcon: "trash", destructive: true }],
    [],
  );

  const onPress = useCallback(
    (e: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>) => {
      if (e.nativeEvent.index === 0) confirmDelete();
    },
    [confirmDelete],
  );

  return { actions, onPress };
}
