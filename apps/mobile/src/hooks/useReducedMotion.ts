import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";

type Listener = () => void;

let reducedMotion = false;
let activeSubscribers = 0;
let subscription: { remove: () => void } | null = null;
const listeners = new Set<Listener>();

function emit(nextValue: boolean) {
  reducedMotion = nextValue;
  listeners.forEach((listener) => listener());
}

function ensureSubscription() {
  if (subscription) return;
  AccessibilityInfo.isReduceMotionEnabled()
    .then(emit)
    .catch(() => {});
  subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", emit);
}

function subscribe(listener: Listener) {
  activeSubscribers += 1;
  listeners.add(listener);
  ensureSubscription();
  return () => {
    activeSubscribers -= 1;
    listeners.delete(listener);
    if (activeSubscribers === 0 && subscription) {
      subscription.remove();
      subscription = null;
    }
  };
}

function getSnapshot() {
  return reducedMotion;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
