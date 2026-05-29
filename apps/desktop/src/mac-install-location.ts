import type { App } from "electron";

export function isAppTranslocated(execPath: string): boolean {
  return execPath.includes("/AppTranslocation/");
}

export function shouldMovePackagedMacAppToApplicationsFolder(app: App, execPath: string): boolean {
  if (process.platform !== "darwin" || !app.isPackaged) return false;
  return !app.isInApplicationsFolder() || isAppTranslocated(execPath);
}

export function movePackagedMacAppToApplicationsFolder(app: App, execPath: string): boolean {
  if (!shouldMovePackagedMacAppToApplicationsFolder(app, execPath)) return false;

  try {
    return app.moveToApplicationsFolder();
  } catch (error) {
    console.warn("[main] failed to move Trace to Applications", error);
    return false;
  }
}
