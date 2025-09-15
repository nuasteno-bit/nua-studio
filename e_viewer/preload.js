const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  connectChannel: (data) => ipcRenderer.invoke('connect-channel', data),
  toggleFrameless: (flag) => ipcRenderer.invoke('toggle-frameless', flag),
  setOpacity: (value) => ipcRenderer.invoke('set-opacity', value),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('set-always-on-top', flag),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  minimize: () => ipcRenderer.send('minimize'),
  maximize: () => ipcRenderer.send('maximize'),
  close: () => ipcRenderer.send('close')
});