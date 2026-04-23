export const TIMESTAMP_REVEAL_DISTANCE = 72;
export const TIMESTAMP_REVEAL_ACTIVATION = 24;
export const TIMESTAMP_REVEAL_RESISTANCE = 0.5;

export function calculateTimestampRevealX(translationX: number): number {
  const overshoot = Math.max(0, translationX - TIMESTAMP_REVEAL_ACTIVATION);
  return Math.min(TIMESTAMP_REVEAL_DISTANCE, overshoot * TIMESTAMP_REVEAL_RESISTANCE);
}
