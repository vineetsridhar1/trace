const MOMENTUM_HISTORY_MS = 160;
const MOMENTUM_IDLE_RESET_MS = 90;
const MOMENTUM_SAMPLE_COUNT = 5;
const MOMENTUM_MIN_PEAK = 20;
const MOMENTUM_TAIL_DELTA = 16;
const MOMENTUM_TAIL_RATIO = 0.55;

export type WheelSample = {
  delta: number;
  direction: number;
  timestamp: number;
};

export function supportsScrollEnd() {
  return typeof document !== "undefined" && "onscrollend" in document.createElement("div");
}

export function getNextWheelSamples(samples: WheelSample[], direction: number, delta: number, now: number) {
  const lastSample = samples.at(-1);

  if (!lastSample || lastSample.direction !== direction || now - lastSample.timestamp > MOMENTUM_IDLE_RESET_MS) {
    return [{ delta, direction, timestamp: now }];
  }

  return [...samples, { delta, direction, timestamp: now }]
    .filter((sample) => now - sample.timestamp <= MOMENTUM_HISTORY_MS)
    .slice(-MOMENTUM_SAMPLE_COUNT);
}

export function isMomentumTail(samples: WheelSample[]) {
  if (samples.length < MOMENTUM_SAMPLE_COUNT) return false;

  const recent = samples.slice(-MOMENTUM_SAMPLE_COUNT);
  const firstDirection = recent[0]?.direction ?? 0;
  const peakDelta = Math.max(...recent.map((sample) => sample.delta));
  const tailDelta = recent[recent.length - 1]?.delta ?? 0;

  return (
    firstDirection !== 0 &&
    peakDelta >= MOMENTUM_MIN_PEAK &&
    recent.every((sample) => sample.direction === firstDirection) &&
    recent.every((sample, index) => index === 0 || sample.timestamp - recent[index - 1]!.timestamp <= 48) &&
    recent.every((sample, index) => index === 0 || sample.delta <= recent[index - 1]!.delta) &&
    (tailDelta <= MOMENTUM_TAIL_DELTA || tailDelta <= peakDelta * MOMENTUM_TAIL_RATIO)
  );
}
