const NEAR_BOTTOM_DISTANCE = 100;

interface ShouldFollowBottomOptions {
  wasFollowing: boolean;
  previousScrollTop: number;
  scrollTop: number;
  distanceFromBottom: number;
}

export function shouldFollowBottom({
  wasFollowing,
  previousScrollTop,
  scrollTop,
  distanceFromBottom,
}: ShouldFollowBottomOptions): boolean {
  if (scrollTop < previousScrollTop || distanceFromBottom >= NEAR_BOTTOM_DISTANCE) {
    return false;
  }

  return wasFollowing || scrollTop > previousScrollTop || distanceFromBottom <= 1;
}
