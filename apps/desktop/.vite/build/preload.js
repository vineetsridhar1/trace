"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("trace", {
  platform: process.platform,
  send: (channel, data) => electron.ipcRenderer.send(channel, data),
  on: (channel, callback) => {
    electron.ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
  pickFolder: () => electron.ipcRenderer.invoke("pick-folder"),
  getGitInfo: (folderPath) => electron.ipcRenderer.invoke("get-git-info", folderPath),
  saveRepoPath: (repoId, localPath) => electron.ipcRenderer.invoke("save-repo-path", repoId, localPath),
  getRepoPath: (repoId) => electron.ipcRenderer.invoke("get-repo-path", repoId)
});
