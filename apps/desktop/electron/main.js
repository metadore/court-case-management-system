const { app, BrowserWindow, net } = require("electron");
const path = require("path");

const LOADING_HTML = `data:text/html,<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0f172a;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #94a3b8;
  }
  .title { font-size: 20px; font-weight: 600; color: #f1f5f9; margin-bottom: 8px; letter-spacing: -0.3px; }
  .sub { font-size: 13px; margin-bottom: 32px; }
  .spinner {
    width: 32px; height: 32px;
    border: 3px solid #1e293b;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
  <div class="title">TPT Court</div>
  <div class="sub">Starting up…</div>
  <div class="spinner"></div>
</body>
</html>`;

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: "TPT Court",
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(LOADING_HTML);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools();
  }

  pollUntilReady("http://localhost:3000", mainWindow);
}

function pollUntilReady(url, win, attempt = 0) {
  const maxAttempts = 120; // 30s at 250ms
  const retryMs = 250;

  const req = net.request(url);
  req.on("response", (res) => {
    // Drain so the connection closes cleanly, then navigate
    res.on("data", () => {});
    res.on("end", () => {
      if (!win.isDestroyed()) win.loadURL(url);
    });
  });
  req.on("error", () => {
    if (attempt >= maxAttempts) {
      if (!win.isDestroyed()) win.loadURL(url);
      return;
    }
    setTimeout(() => pollUntilReady(url, win, attempt + 1), retryMs);
  });
  req.end();
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
