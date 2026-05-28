import type { App } from "electron";

export function isAppTranslocated(execPath: string): boolean {
  return execPath.includes("/AppTranslocation/");
}

export function movePackagedMacAppToApplicationsFolder(app: App, execPath: string): boolean {
  if (process.platform !== "darwin" || !app.isPackaged) return false;
  if (app.isInApplicationsFolder() && !isAppTranslocated(execPath)) return false;

  try {
    return app.moveToApplicationsFolder();
  } catch (error) {
    console.warn("[main] failed to move Trace to Applications", error);
    return false;
  }
}
