const { app, BrowserWindow, Menu, nativeTheme, protocol, shell } = require("electron");
const fs = require("fs");
const path = require("path");

const DIST_DIR = path.resolve(__dirname, "../dist");
const ICON_PATH = path.resolve(__dirname, "../public/pwa-512x512.png");
const APP_URL = process.env.ELECTRON_START_URL || "app://lernwerk/index.html";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
    case ".webmanifest":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".ico":
      return "image/x-icon";
    case ".webp":
      return "image/webp";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".ttf":
      return "font/ttf";
    case ".wasm":
      return "application/wasm";
    case ".txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function resolveDistFile(requestUrl) {
  const parsed = new URL(requestUrl);
  let relPath = decodeURIComponent(parsed.pathname || "/");
  if (relPath === "/" || relPath === "") {
    relPath = "index.html";
  } else {
    relPath = relPath.replace(/^\/+/, "");
  }

  let target = path.resolve(DIST_DIR, relPath);
  if (target !== DIST_DIR && !target.startsWith(DIST_DIR + path.sep)) {
    target = path.join(DIST_DIR, "index.html");
  }

  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    target = path.join(DIST_DIR, "index.html");
  }

  return target;
}

let mainWindow = null;

function buildAppMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: "LernWerk",
            submenu: [
              { role: "about", label: "Über LernWerk" },
              { type: "separator" },
              { role: "hide", label: "LernWerk ausblenden" },
              { role: "hideOthers", label: "Andere ausblenden" },
              { role: "unhide", label: "Alle einblenden" },
              { type: "separator" },
              { role: "quit", label: "LernWerk beenden" },
            ],
          },
        ]
      : []),
    {
      label: "Datei",
      submenu: [
        { role: "reload", label: "Neu laden" },
        { type: "separator" },
        isMac
          ? { role: "close", label: "Fenster schließen" }
          : { role: "quit", label: "Beenden" },
      ],
    },
    {
      label: "Bearbeiten",
      submenu: [
        { role: "undo", label: "Rückgängig" },
        { role: "redo", label: "Wiederholen" },
        { type: "separator" },
        { role: "cut", label: "Ausschneiden" },
        { role: "copy", label: "Kopieren" },
        { role: "paste", label: "Einfügen" },
        { role: "selectAll", label: "Alles auswählen" },
      ],
    },
    {
      label: "Ansicht",
      submenu: [
        { role: "resetZoom", label: "Originalgröße" },
        { role: "zoomIn", label: "Vergrößern" },
        { role: "zoomOut", label: "Verkleinern" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Vollbild" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 620,
    title: "LernWerk",
    icon: ICON_PATH,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0E1116" : "#F5F6F4",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const targetUrl = new URL(url);
      const allowedUrl = new URL(APP_URL);
      if (
        targetUrl.protocol !== allowedUrl.protocol ||
        targetUrl.host !== allowedUrl.host
      ) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle("app", (request) => {
      const filePath = resolveDistFile(request.url);
      const data = fs.readFileSync(filePath);
      return new Response(data, {
        status: 200,
        headers: {
          "Content-Type": getMimeType(filePath),
        },
      });
    });

    buildAppMenu();
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
}
