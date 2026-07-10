const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');

let mainWindow;

// 1. Setup Local Server for Web-to-Electron Communication
function setupServer() {
  const serverApp = express();
  serverApp.use(cors());
  serverApp.use(express.json());

  const server = http.createServer(serverApp);
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    ws.on('message', (message) => {
      try {
        const msgString = message.toString();
        // Broadcast to all connected clients
        wss.clients.forEach((client) => {
          if (client.readyState === 1) { // 1 = OPEN
            client.send(msgString);
          }
        });
      } catch (e) {
        console.error('Invalid WS message', e);
      }
    });
  });

  server.listen(4000, () => {
    console.log('Local speech server running on port 4000');
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 300,
    transparent: true,
    frame: false,
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
  setupServer();
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
