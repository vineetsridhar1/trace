import { contextBridge, ipcRenderer } from 'electron';

export interface LogEntry {
  id: number;
  event_type: string;
  tool_name: string | null;
  input_json: string;
  timestamp: string;
}

contextBridge.exposeInMainWorld('traceAPI', {
  // PTY
  onPtyData: (cb: (data: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: string) => cb(data);
    ipcRenderer.on('pty-data', listener);
    return () => ipcRenderer.removeListener('pty-data', listener);
  },
  onPtyExit: (cb: (code: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, code: number) => cb(code);
    ipcRenderer.on('pty-exit', listener);
    return () => ipcRenderer.removeListener('pty-exit', listener);
  },
  sendPtyInput: (data: string) => ipcRenderer.send('pty-input', data),
  resizePty: (cols: number, rows: number) => ipcRenderer.send('pty-resize', cols, rows),

  // Logs / Activity Feed
  getLogs: (limit?: number): Promise<LogEntry[]> => ipcRenderer.invoke('get-logs', limit),
  onNewLogEvent: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('new-log-event', listener);
    return () => ipcRenderer.removeListener('new-log-event', listener);
  },
});
