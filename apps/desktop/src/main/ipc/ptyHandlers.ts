import { ipcMain } from "electron";
import {
  createPty,
  writePty,
  resizePty,
  killPty,
  getPtyCwd,
  getPtyEnv,
  hasPty,
  getPtyProcesses,
  getScrollback,
} from "../pty";
import { getMainWindow } from "./shared";

const PTY_CREATE_CHANNEL = "pty-create";
const PTY_WRITE_CHANNEL = "pty-write";
const PTY_RESIZE_CHANNEL = "pty-resize";
const PTY_KILL_CHANNEL = "pty-kill";
const PTY_HAS_CHANNEL = "pty-has";
const PTY_GET_SCROLLBACK_CHANNEL = "pty-get-scrollback";
const PTY_GET_PROCESSES_CHANNEL = "pty-get-processes";

export function registerPtyHandlers(): void {
  ipcMain.removeHandler(PTY_CREATE_CHANNEL);
  ipcMain.handle(
    PTY_CREATE_CHANNEL,
    (
      _event,
      terminalId: string,
      cwd: string,
      extraEnv?: Record<string, string>,
    ) => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return { success: false, error: "No main window" };
      try {
        createPty(terminalId, cwd, mainWindow, extraEnv);
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.removeHandler(PTY_WRITE_CHANNEL);
  ipcMain.handle(
    PTY_WRITE_CHANNEL,
    (_event, terminalId: string, data: string) => {
      const mainWindow = getMainWindow();
      let success = writePty(terminalId, data);
      if (!success && mainWindow) {
        const cwd = getPtyCwd(terminalId);
        if (cwd) {
          try {
            createPty(terminalId, cwd, mainWindow, getPtyEnv(terminalId));
            success = writePty(terminalId, data);
          } catch {
            success = false;
          }
        }
      }
      return { success };
    },
  );

  ipcMain.removeHandler(PTY_RESIZE_CHANNEL);
  ipcMain.handle(
    PTY_RESIZE_CHANNEL,
    (_event, terminalId: string, cols: number, rows: number) => {
      const mainWindow = getMainWindow();
      let success = resizePty(terminalId, cols, rows);
      if (!success && mainWindow) {
        const cwd = getPtyCwd(terminalId);
        if (cwd) {
          try {
            createPty(terminalId, cwd, mainWindow, getPtyEnv(terminalId));
            success = resizePty(terminalId, cols, rows);
          } catch {
            success = false;
          }
        }
      }
      return { success };
    },
  );

  ipcMain.removeHandler(PTY_KILL_CHANNEL);
  ipcMain.handle(PTY_KILL_CHANNEL, (_event, terminalId: string) => {
    return { success: killPty(terminalId) };
  });

  ipcMain.removeHandler(PTY_HAS_CHANNEL);
  ipcMain.handle(PTY_HAS_CHANNEL, (_event, terminalId: string) => {
    return { success: true, exists: hasPty(terminalId) };
  });

  ipcMain.removeHandler(PTY_GET_SCROLLBACK_CHANNEL);
  ipcMain.handle(PTY_GET_SCROLLBACK_CHANNEL, (_event, terminalId: string) => {
    return { success: true, data: getScrollback(terminalId) };
  });

  ipcMain.removeHandler(PTY_GET_PROCESSES_CHANNEL);
  ipcMain.handle(PTY_GET_PROCESSES_CHANNEL, (_event, terminalIds: string[]) => {
    return { success: true, processes: getPtyProcesses(terminalIds) };
  });
}
