export const RECONNECTING_DELAY_MS = 10_000;
export const OFFLINE_DELAY_MS = 3_000;
export const FOREGROUND_GRACE_MS = 4_000;

export type AppConnectivityBannerKind = "offline" | "reconnecting";

interface ForegroundGraceInput {
  appActive: boolean;
  foregroundedAt: number;
  now: number;
}

interface AppConnectivityBannerInput extends ForegroundGraceInput {
  disconnectedAt: number | null;
  hasConnectedBefore: boolean;
  isConnected: boolean;
  isResolved: boolean;
  networkDisconnectedAt: number | null;
  wsConnected: boolean;
}

export function isForegroundGraceElapsed({
  appActive,
  foregroundedAt,
  now,
}: ForegroundGraceInput): boolean {
  return appActive && now - foregroundedAt >= FOREGROUND_GRACE_MS;
}

export function shouldTickConnectivityClock({
  appActive,
  disconnectedAt,
  foregroundedAt,
  hasConnectedBefore,
  isConnected,
  isResolved,
  networkDisconnectedAt,
  now,
  wsConnected,
}: AppConnectivityBannerInput): boolean {
  if (!appActive) return false;
  if (!isForegroundGraceElapsed({ appActive, foregroundedAt, now })) return true;
  if (isResolved && !isConnected && networkDisconnectedAt !== null) return true;
  return isConnected && hasConnectedBefore && !wsConnected && disconnectedAt !== null;
}

export function getAppConnectivityBannerKind({
  appActive,
  disconnectedAt,
  foregroundedAt,
  hasConnectedBefore,
  isConnected,
  isResolved,
  networkDisconnectedAt,
  now,
  wsConnected,
}: AppConnectivityBannerInput): AppConnectivityBannerKind | null {
  if (!isForegroundGraceElapsed({ appActive, foregroundedAt, now })) return null;

  if (
    isResolved &&
    !isConnected &&
    networkDisconnectedAt !== null &&
    now - networkDisconnectedAt >= OFFLINE_DELAY_MS
  ) {
    return "offline";
  }

  if (
    isConnected &&
    hasConnectedBefore &&
    !wsConnected &&
    disconnectedAt !== null &&
    now - disconnectedAt >= RECONNECTING_DELAY_MS
  ) {
    return "reconnecting";
  }

  return null;
}

export function shouldShowSessionConnectionLost({
  appActive,
  foregroundedAt,
  now,
}: ForegroundGraceInput): boolean {
  return isForegroundGraceElapsed({ appActive, foregroundedAt, now });
}
