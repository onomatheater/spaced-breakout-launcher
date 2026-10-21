const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getState: () => ipcRenderer.invoke("get-state"),
  checkUpdate: () => ipcRenderer.invoke("check-update"),
  download: () => ipcRenderer.invoke("download"),
  cancelDownload: () => ipcRenderer.invoke("cancel-download"),
  install: (opts) => ipcRenderer.invoke("install", opts),
  play: () => ipcRenderer.invoke("play"),
  openModsDir: () => ipcRenderer.invoke("open-mods-dir"),
  pickGameExe: () => ipcRenderer.invoke("pick-game-exe"),
  pickModsDir: () => ipcRenderer.invoke("pick-mods-dir"),
  saveSettings: (s) => ipcRenderer.invoke("save-settings", s),
  getCredits: () => ipcRenderer.invoke("get-credits"),
  openUrl: (u) => ipcRenderer.invoke("open-url", u),
  onProgress: (cb) => ipcRenderer.on("progress", (_e, v) => cb(v)),
  onStatus: (cb) => ipcRenderer.on("status", (_e, v) => cb(v)),
});
