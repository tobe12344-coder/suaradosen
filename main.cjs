const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 450,
    transparent: true,
    frame: false,
    icon: app.isPackaged ? path.join(__dirname, 'dist/logo.png') : path.join(__dirname, 'public/logo.png'),
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Keep it always on top
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  // Set click-through to true by default for transparent areas
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  const url = process.env.VITE_DEV_SERVER_URL || `file://${path.join(__dirname, 'dist/index.html')}`;
  
  // Appending ?mode=receiver to inform React it's running in Electron
  mainWindow.loadURL(`${url}${url.includes('?') ? '&' : '?'}mode=receiver`);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handler to toggle click-through
ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setIgnoreMouseEvents(ignore, { forward: true });
  }
});
