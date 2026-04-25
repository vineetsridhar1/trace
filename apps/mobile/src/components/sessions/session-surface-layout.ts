export function getSessionSurfaceComposerBottomPadding({
  keyboardVisible,
  tabBarHeight,
  bottomInset,
  spacingMd,
  bridgeLocked,
}: {
  keyboardVisible: boolean;
  tabBarHeight: number;
  bottomInset: number;
  spacingMd: number;
  bridgeLocked: boolean;
}): number {
  if (keyboardVisible) return 0;
  if (bridgeLocked) {
    return Math.max(tabBarHeight, bottomInset + spacingMd);
  }
  return Math.max(0, tabBarHeight - bottomInset);
}
