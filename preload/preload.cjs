const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('archivist', {
  pickFile: () => ipcRenderer.invoke('pick-file'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  getArchiveRoot: () => ipcRenderer.invoke('get-archive-root'),
  setArchiveRoot: (absPath) => ipcRenderer.invoke('set-archive-root', absPath),
  archive: (sourcePath, meta) => ipcRenderer.invoke('archive', { sourcePath, meta }),
  search: (q, filters) => ipcRenderer.invoke('search', { q, filters }),
  manualIndex: (absPath) => ipcRenderer.invoke('manual-index', absPath),
  updateDesc: (id, text) => ipcRenderer.invoke('update-desc', { id, text }),
  getFileById: (id) => ipcRenderer.invoke('get-file-by-id', id),
  getStats: () => ipcRenderer.invoke('get-stats'),
  revealPath: (filePath) => ipcRenderer.invoke('reveal-path', filePath),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  readFileForPreview: (filePath) => ipcRenderer.invoke('read-file-for-preview', filePath),
});
