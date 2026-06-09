const { app, BrowserWindow } = require("electron");
const path = require("node:path");

require("dotenv").config({
  path: path.join(__dirname, "../../.env")
});

const isDev = !app.isPackaged;

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1300,
    height: 860,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Local desktop app: allow OpenAI-compatible providers from renderer (e.g., Kimi CN).
      webSecurity: false
    }
  });

  if (isDev) {
    window.loadURL("http://localhost:5199");
  } else {
    window.loadFile(path.join(__dirname, "../../dist/index.html"));
  }
}

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
