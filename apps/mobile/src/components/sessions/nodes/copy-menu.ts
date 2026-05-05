import * as Clipboard from "expo-clipboard";
import type { ContextMenuAction } from "react-native-context-menu-view";
import { haptic } from "@/lib/haptics";

export const COPY_ACTION_INDEX = 0;
export const COPY_CONTEXT_MENU: ContextMenuAction[] = [{ title: "Copy" }];

export async function copyTextToClipboard(text: string) {
  const copyText = text.trim();
  if (!copyText) return;
  await Clipboard.setStringAsync(copyText);
  void haptic.light();
}
