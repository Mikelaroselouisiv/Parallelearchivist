import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('archivist', {
  pickSourceFolder: () => ipcRenderer.invoke('pick-source-folder'),
  startWatch: (sourceDir) => ipcRenderer.invoke('watch-start', { sourceDir }),
  stopWatch: () => ipcRenderer.invoke('watch-stop'),
  setRules: (rules) => ipcRenderer.invoke('rules-set', rules),
  search: (q, filters) => ipcRenderer.invoke('search', { q, filters }),
  manualIndex: (absPath) => ipcRenderer.invoke('manual-index', absPath)
});
