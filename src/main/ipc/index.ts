import { ipcMain } from "electron";
import { setMainWindow, sendToRenderer, resolveServerUrl } from "./shared";
import { registerAgentHandlers } from "./agentHandlers";
import { registerWorktreeHandlers } from "./worktreeHandlers";
import { registerPtyHandlers } from "./ptyHandlers";
import { registerGitHandlers } from "./gitHandlers";
import { registerGithubHandlers } from "./githubHandlers";
import { registerRepoHandlers } from "./repoHandlers";
import { registerMiscHandlers } from "./miscHandlers";

export { setMainWindow, sendToRenderer };

export function registerIpcHandlers() {
  // Sync handler so the renderer can get the server URL synchronously via preload
  ipcMain.removeAllListeners("get-server-url");
  ipcMain.on("get-server-url", (event) => {
    event.returnValue = resolveServerUrl();
  });

  registerAgentHandlers();
  registerWorktreeHandlers();
  registerPtyHandlers();
  registerGitHandlers();
  registerGithubHandlers();
  registerRepoHandlers();
  registerMiscHandlers();
}
