const { app, BrowserWindow } = require('electron');
const config = require('./machine-config');

function buildWidgetUrl() {
  if (process.env.WIDGET_URL) return process.env.WIDGET_URL;
  const base = (config.baseUrl || 'http://194.1.31.11:8082/machine-efficiency-widget').replace(
    /\/$/,
    ''
  );
  const qs = new URLSearchParams({
    process: config.process || 'DRAWING',
    machine: config.machine || ''
  });
  return `${base}?${qs.toString()}`;
}

function createWindow() {
  const machineName = config.machine || 'Machine Efficiency';
  const win = new BrowserWindow({
    width: 360,
    height: 380,
    minWidth: 300,
    minHeight: 280,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    closable: false,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    title: machineName,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Block Alt+F4 / programmatic close (Task Manager can still kill the process)
  win.on('close', (e) => {
    e.preventDefault();
  });

  win.loadURL(buildWidgetUrl());
}

// Prevent quitting the app from the dock/taskbar "Close window" where possible
app.on('before-quit', (e) => {
  e.preventDefault();
});

app.whenReady().then(createWindow);
app.on('window-all-closed', (e) => {
  e.preventDefault();
});
