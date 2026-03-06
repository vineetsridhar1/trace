import { BrowserWindow } from "electron";

let mainWindowRef: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindowRef;
}

export function setMainWindow(win: BrowserWindow) {
  mainWindowRef = win;
}

export function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, ...args);
  }
}

export function resolveServerUrl(): string {
  const raw = process.env.TRACE_SERVER_URL;
  let url: string;
  if (!raw) {
    url = process.env.TRACE_PROD
      ? "https://trace-6kt7.onrender.com"
      : "http://localhost:3100";
  } else if (raw.startsWith("http")) {
    url = raw;
  } else {
    url = `http://localhost:${raw}`;
  }
  console.log(
    `[ipc] resolveServerUrl: TRACE_SERVER_URL=${raw ?? "(unset)"} → ${url}`,
  );
  return url;
}
