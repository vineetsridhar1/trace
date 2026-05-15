export interface SessionVirtualPaddingItem {
  start: number;
  end: number;
}

export function getSessionVirtualPadding(
  virtualItems: readonly SessionVirtualPaddingItem[],
  totalSize: number,
) {
  const firstVirtualItem = virtualItems[0];
  const lastVirtualItem = virtualItems[virtualItems.length - 1];

  return {
    paddingTop: firstVirtualItem?.start ?? 0,
    paddingBottom: lastVirtualItem ? Math.max(0, totalSize - lastVirtualItem.end) : 0,
  };
}
