import { ipcMain, dialog } from "electron";
import { allocatePorts, releasePorts } from "../ports";
import {
  getChannelLocalConfig,
  setChannelLocalConfig,
  getAllChannelLocalConfigs,
  deleteChannelLocalConfig,
  getGlobalConfig,
  setGlobalConfig,
} from "../localConfig";
import type { LocalChannelConfig, GlobalAppConfig } from "../localConfig";
import { runningProcesses } from "../worktree";
import { getMainWindow } from "./shared";

const ALLOCATE_PORTS_CHANNEL = "allocate-ports";
const RELEASE_PORTS_CHANNEL = "release-ports";
const FOCUS_WINDOW_CHANNEL = "focus-window";
const SELECT_FOLDER_CHANNEL = "select-folder";
const CHECK_RUNNING_PROCESSES_CHANNEL = "check-running-processes";
const GET_LOCAL_CONFIG_CHANNEL = "get-local-config";
const SET_LOCAL_CONFIG_CHANNEL = "set-local-config";
const GET_ALL_LOCAL_CONFIGS_CHANNEL = "get-all-local-configs";
const DELETE_LOCAL_CONFIG_CHANNEL = "delete-local-config";
const GET_GLOBAL_CONFIG_CHANNEL = "get-global-config";
const SET_GLOBAL_CONFIG_CHANNEL = "set-global-config";

export function registerMiscHandlers(): void {
  ipcMain.removeHandler(ALLOCATE_PORTS_CHANNEL);
  ipcMain.handle(
    ALLOCATE_PORTS_CHANNEL,
    async (_event, workspaceId: string, count: number) => {
      try {
        const ports = await allocatePorts(workspaceId, count);
        return { success: true, ports };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.removeHandler(RELEASE_PORTS_CHANNEL);
  ipcMain.handle(RELEASE_PORTS_CHANNEL, (_event, workspaceId: string) => {
    try {
      releasePorts(workspaceId);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.removeHandler(FOCUS_WINDOW_CHANNEL);
  ipcMain.handle(FOCUS_WINDOW_CHANNEL, () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  ipcMain.removeHandler(SELECT_FOLDER_CHANNEL);
  ipcMain.handle(SELECT_FOLDER_CHANNEL, async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return { success: false, error: "No main window" };
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, canceled: true };
    }
    return { success: true, canceled: false, path: result.filePaths[0] };
  });

  ipcMain.removeHandler(GET_LOCAL_CONFIG_CHANNEL);
  ipcMain.handle(GET_LOCAL_CONFIG_CHANNEL, (_event, channelId: string) => {
    return getChannelLocalConfig(channelId);
  });

  ipcMain.removeHandler(SET_LOCAL_CONFIG_CHANNEL);
  ipcMain.handle(
    SET_LOCAL_CONFIG_CHANNEL,
    (_event, channelId: string, data: LocalChannelConfig) => {
      setChannelLocalConfig(channelId, data);
      return { success: true };
    },
  );

  ipcMain.removeHandler(GET_ALL_LOCAL_CONFIGS_CHANNEL);
  ipcMain.handle(GET_ALL_LOCAL_CONFIGS_CHANNEL, () => {
    return getAllChannelLocalConfigs();
  });

  ipcMain.removeHandler(DELETE_LOCAL_CONFIG_CHANNEL);
  ipcMain.handle(DELETE_LOCAL_CONFIG_CHANNEL, (_event, channelId: string) => {
    deleteChannelLocalConfig(channelId);
    return { success: true };
  });

  ipcMain.removeHandler(GET_GLOBAL_CONFIG_CHANNEL);
  ipcMain.handle(GET_GLOBAL_CONFIG_CHANNEL, () => {
    return getGlobalConfig();
  });

  ipcMain.removeHandler(SET_GLOBAL_CONFIG_CHANNEL);
  ipcMain.handle(SET_GLOBAL_CONFIG_CHANNEL, (_event, data: GlobalAppConfig) => {
    setGlobalConfig(data);
    return { success: true };
  });

  ipcMain.removeHandler(CHECK_RUNNING_PROCESSES_CHANNEL);
  ipcMain.handle(
    CHECK_RUNNING_PROCESSES_CHANNEL,
    (_event, workspaceIds: string[]) => {
      const running = workspaceIds.filter((id) => runningProcesses.has(id));
      return { success: true, running };
    },
  );
}
