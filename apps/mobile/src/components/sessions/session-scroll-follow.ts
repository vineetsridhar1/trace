const SCROLL_UP_EPSILON = 1;

interface NextFollowLatestInput {
  currentlyFollowing: boolean;
  distanceFromBottom: number;
  isUserScrolling: boolean;
  nearBottomThreshold: number;
  previousOffset: number;
  nextOffset: number;
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
