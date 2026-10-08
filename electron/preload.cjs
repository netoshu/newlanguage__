const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("nativeAPI",{
  saveFile:(payload)=>ipcRenderer.invoke("save-file",payload),
  saveJSON:(payload)=>ipcRenderer.invoke("save-json",payload)
});
