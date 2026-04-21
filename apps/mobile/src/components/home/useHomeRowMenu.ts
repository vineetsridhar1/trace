import { useCallback, useMemo } from "react";
import { Linking, type NativeSyntheticEvent } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  type ContextMenuAction,
  type ContextMenuOnPressNativeEvent,
} from "react-native-context-menu-view";
import { DISMISS_SESSION_MUTATION } from "@trace/client-core";
import { getClient } from "@/lib/urql";
import { haptic } from "@/lib/haptics";

export interface HomeRowMenuParams {
  sessionId: string;
  sessionGroupId: string | null | undefined;
  prUrl: string | null | undefined;
  isActive: boolean;
}

export interface HomeRowMenu {
  actions: ContextMenuAction[];
  onPress: (e: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>) => void;
}

/**
 * Builds the long-press context menu for a home row. Slots collapse when
 * `prUrl` is missing or the session isn't active, so the press handler walks
 * a cursor instead of a fixed index map.
 */
export function useHomeRowMenu({
  sessionId,
  sessionGroupId,
  prUrl,
  isActive,
}: HomeRowMenuParams): HomeRowMenu {
  const handleStop = useCallback(async () => {
    void haptic.heavy();
    const result = await getClient()
      .mutation(DISMISS_SESSION_MUTATION, { id: sessionId })
      .toPromise();
    if (result.error) {
      void haptic.error();
      console.warn("[dismissSession] failed", result.error);
    }
  }, [sessionId]);

  const handleOpenPr = useCallback(async () => {
    if (!prUrl) return;
    void haptic.light();
    try {
      await Linking.openURL(prUrl);
    } catch (err) {
      void haptic.error();
      console.warn("[openPR] failed", err);
    }
  }, [prUrl]);

  const handleCopyLink = useCallback(async () => {
    const link = sessionGroupId
      ? `trace://sessions/${sessionGroupId}/${sessionId}`
      : `trace://sessions/${sessionId}`;
    await Clipboard.setStringAsync(link);
    void haptic.light();
  }, [sessionGroupId, sessionId]);

  const actions = useMemo<ContextMenuAction[]>(() => {
    const items: ContextMenuAction[] = [];
    if (prUrl) items.push({ title: "Open PR", systemIcon: "arrow.up.right.square" });
    if (isActive) {
      items.push({ title: "Stop session", systemIcon: "stop.circle", destructive: true });
    }
    items.push({ title: "Copy link", systemIcon: "link" });
    return items;
  }, [prUrl, isActive]);

  const onPress = useCallback(
    (e: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>) => {
      const idx = e.nativeEvent.index;
      let cursor = 0;
      if (prUrl) {
        if (idx === cursor) {
          void handleOpenPr();
          return;
        }
        cursor += 1;
      }
      if (isActive) {
        if (idx === cursor) {
          void handleStop();
          return;
        }
        cursor += 1;
      }
      if (idx === cursor) void handleCopyLink();
    },
    [prUrl, isActive, handleOpenPr, handleStop, handleCopyLink],
  );

  return { actions, onPress };
}
