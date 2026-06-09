import { app, BrowserWindow, Tray, Menu, shell, nativeImage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { startServer } from './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray = null;
let mainWindow = null;
let serverPort = null;

// Hide icon from dock on macOS (just in case)
if (process.platform === 'darwin') {
  app.dock.hide();
}

async function createWindow(port) {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.on('close', (event) => {
    // Override default close to minimize to tray instead
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  // Create native image and resize it for the tray to ensure it looks good
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: '開啟 LOL Skin Library', 
      click: () => {
        if (serverPort) createWindow(serverPort);
      }
    },
    {
      label: '在外部瀏覽器中開啟',
      click: () => {
        if (serverPort) shell.openExternal(`http://127.0.0.1:${serverPort}`);
      }
    },
    { type: 'separator' },
    { 
      label: '結束並退出', 
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('LOL Skin Library');
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
    if (serverPort) createWindow(serverPort);
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    createTray();
    
    try {
      serverPort = await startServer();
      // Show window on first launch
      createWindow(serverPort);
    } catch (err) {
      console.error('Failed to start Express server:', err);
    }
    
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && serverPort) {
        createWindow(serverPort);
      }
    });
  });
}

app.on('window-all-closed', () => {
  // Prevent quitting when window is closed, keep it in tray
});
