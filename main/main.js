// main.js
import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ensureDB, insertManualFile, queryFiles, updateHumanDesc, getFileById, getStats, getArchiveRoot, setArchiveRoot } from './db.js';
import { archiveFromPath } from './archive.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let win;

const iconPath = path.join(__dirname, '../assets/logo.png');
const iconIco = path.join(__dirname, '../build/icons/app.ico');

function createWindow() {
  const icon = nativeImage.createFromPath(fs.existsSync(iconIco) ? iconIco : iconPath);
  win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    icon: icon.isEmpty() ? undefined : icon,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

process.on('uncaughtException', (e) => console.error('uncaughtException:', e));
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));

app.whenReady().then(async () => {
  await ensureDB();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC
ipcMain.handle('pick-file', async () => {
  const res = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [
      { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'ods', 'odp'] },
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
      { name: 'Vidéos', extensions: ['mp4', 'mov', 'avi', 'webm', 'mkv'] },
      { name: 'Tous les formats', extensions: ['*'] },
    ],
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});

ipcMain.handle('pick-folder', async () => {
  const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});

ipcMain.handle('get-archive-root', async () => getArchiveRoot());
ipcMain.handle('set-archive-root', async (e, absPath) => { setArchiveRoot(absPath); return true; });

ipcMain.handle('archive', async (e, { sourcePath, meta }) => {
  return archiveFromPath(sourcePath, meta || {});
});

ipcMain.handle('search', async (e, { q, filters }) => queryFiles(q || '', filters || {}));
ipcMain.handle('manual-index', async (e, fileAbsolutePath) => insertManualFile(fileAbsolutePath));
ipcMain.handle('update-desc', async (e, { id, text }) => {
  updateHumanDesc(id, text ?? null);
  return true;
});
ipcMain.handle('get-file-by-id', async (e, id) => getFileById(id));
ipcMain.handle('get-stats', async () => getStats());
ipcMain.handle('reveal-path', async (e, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('open-file', async (e, filePath) => {
  shell.openPath(filePath);
});

// Preview : lecture du fichier pour blob URL (max 100MB)
ipcMain.handle('read-file-for-preview', async (e, filePath) => {
  const fs = await import('node:fs/promises');
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > 100 * 1024 * 1024) return null;
  const buf = await fs.readFile(filePath);
  return buf.toString('base64');
});
