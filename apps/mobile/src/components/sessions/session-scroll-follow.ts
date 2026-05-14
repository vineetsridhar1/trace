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
