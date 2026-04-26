import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

interface AppForegroundStatus {
  appActive: boolean;
  foregroundedAt: number;
}

interface AppStateSnapshot {
  appState: AppStateStatus;
  foregroundedAt: number;
}

export function useAppForegroundStatus(): AppForegroundStatus {
  const [snapshot, setSnapshot] = useState<AppStateSnapshot>(() => ({
    appState: AppState.currentState,
    foregroundedAt: Date.now(),
  }));

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      setSnapshot((current) => ({
        appState: nextState,
        foregroundedAt: nextState === "active" ? Date.now() : current.foregroundedAt,
      }));
    });
    return () => sub.remove();
  }, []);

  return {
    appActive: snapshot.appState === "active",
    foregroundedAt: snapshot.foregroundedAt,
  };
}
