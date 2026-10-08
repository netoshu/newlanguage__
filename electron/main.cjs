const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs/promises");

function createWindow(){
  const win = new BrowserWindow({
    width:1440,height:900,minWidth:1000,minHeight:700,
    backgroundColor:"#030305",
    webPreferences:{preload:path.join(__dirname,"preload.cjs"),contextIsolation:true,nodeIntegration:false}
  });
  win.loadFile(path.join(__dirname,"../src/index.html"));
}
app.whenReady().then(()=>{
  ipcMain.handle("save-file",async(_,payload)=>{
    const result=await dialog.showSaveDialog({defaultPath:payload.defaultPath||"gesture-session.json"});
    if(result.canceled) return null;
    await fs.writeFile(result.filePath,payload.data,"utf8");
    return result.filePath;
  });
  ipcMain.handle("save-json",async(_,payload)=>{
    const result=await dialog.showSaveDialog({defaultPath:"gesture-session.json",filters:[{name:"JSON",extensions:["json"]},{name:"CSV",extensions:["csv"]}]});
    if(result.canceled) return null;
    await fs.writeFile(result.filePath,payload.data,"utf8");
    return result.filePath;
  });
  createWindow();
  app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
