import { ipcMain } from "electron";
import {
  getInstanceId,
  getInstanceName,
  setInstanceName,
  setPassword,
} from "../instanceConnection";

const GET_ID_CHANNEL = "instance:getId";
const GET_NAME_CHANNEL = "instance:getName";
const SET_NAME_CHANNEL = "instance:setName";
const SET_PASSWORD_CHANNEL = "instance:setPassword";

export function registerInstanceHandlers(): void {
  ipcMain.removeHandler(GET_ID_CHANNEL);
  ipcMain.handle(GET_ID_CHANNEL, () => {
    return getInstanceId();
  });

  ipcMain.removeHandler(GET_NAME_CHANNEL);
  ipcMain.handle(GET_NAME_CHANNEL, () => {
    return getInstanceName();
  });

  ipcMain.removeHandler(SET_NAME_CHANNEL);
  ipcMain.handle(SET_NAME_CHANNEL, (_event, name: string) => {
    setInstanceName(name);
    return { success: true };
  });

  ipcMain.removeHandler(SET_PASSWORD_CHANNEL);
  ipcMain.handle(SET_PASSWORD_CHANNEL, async (_event, password: string | null) => {
    return setPassword(password);
  });
}
