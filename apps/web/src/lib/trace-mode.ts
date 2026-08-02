import { blockNavigation } from "./navigation-blocker";

export function switchDesktopTraceMode(mode: DesktopTraceMode): void {
  if (!window.trace?.switchTraceMode) return;
  if (blockNavigation(() => switchDesktopTraceMode(mode))) return;
  void window.trace.switchTraceMode(mode).catch((error: unknown) => {
    console.error(`[desktop] failed to switch to ${mode} Trace`, error);
  });
}
