import type { ContextMenuAction } from "react-native-context-menu-view";

export {
  formatCommandLabel,
  formatTime,
  getCommandPrefix,
  serializeUnknown,
  stripPromptWrapping,
  truncate,
} from "@trace/client-core";

/** Shared Copy action used by user/assistant bubble context menus. */
export const COPY_CONTEXT_MENU: ContextMenuAction[] = [{ title: "Copy" }];
