const SCROLL_UP_EPSILON = 1;

interface NextFollowLatestInput {
  currentlyFollowing: boolean;
  distanceFromBottom: number;
  isUserScrolling: boolean;
  nearBottomThreshold: number;
  previousOffset: number;
  nextOffset: number;
}

interface PrependOffsetInput {
  previousContentHeight: number;
  nextContentHeight: number;
  anchorOffset: number;
}

interface ShouldCompensatePrependAnchorInput {
  hasPrepended: boolean;
  isLoadingOlder: boolean;
  loadedOlderEvents: boolean | null;
  nextContentHeight: number;
  lastCompensatedHeight: number;
}

export function nextFollowLatestState({
  currentlyFollowing,
  distanceFromBottom,
  isUserScrolling,
  nearBottomThreshold,
  previousOffset,
  nextOffset,
}: NextFollowLatestInput): boolean {
  if (isUserScrolling && nextOffset < previousOffset - SCROLL_UP_EPSILON) {
    return false;
  }
  if (distanceFromBottom < nearBottomThreshold) {
    return true;
  }
  return currentlyFollowing;
}

export function offsetAfterPrepend({
  previousContentHeight,
  nextContentHeight,
  anchorOffset,
}: PrependOffsetInput): number {
  return Math.max(0, anchorOffset + nextContentHeight - previousContentHeight);
}

export function shouldCompensatePrependAnchor({
  hasPrepended,
  isLoadingOlder,
  loadedOlderEvents,
  nextContentHeight,
  lastCompensatedHeight,
}: ShouldCompensatePrependAnchorInput): boolean {
  if (hasPrepended) return true;
  if (isLoadingOlder) return true;
  if (loadedOlderEvents === false) return true;
  return loadedOlderEvents !== null && nextContentHeight < lastCompensatedHeight;
}
