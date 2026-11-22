import { app, BrowserWindow, Menu, Tray, session, shell } from 'electron'
import { join } from 'node:path'
import { closeDatabase, initDatabase } from './database'
import { registerIpc, type IpcLifecycle } from './ipc'
import { initLogger, log, logError } from './logger'

app.setName('Odissey Client')

let mainWindow: BrowserWindow | null = null
let ipcLifecycle: IpcLifecycle | null = null
let tray: Tray | null = null

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  mainWindow?.show()
  mainWindow?.focus()
}

function createTray(): void {
  if (tray) return
  tray = new Tray(appIcon())
  tray.setToolTip('Odissey Client')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Mostrar Odissey Client', click: showMainWindow },
      { type: 'separator' },
      {
        label: 'Salir',
        click: () => {
          if (ipcLifecycle?.isGameRunning()) {
            showMainWindow()
            return
          }
          app.quit()
        }
      }
    ])
  )
  tray.on('click', showMainWindow)
  tray.on('double-click', showMainWindow)
}

function appIcon(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', 'icon.png')
    : join(__dirname, '../../resources/icon.png')
}

function applyCsp(): void {
  if (process.env.ELECTRON_RENDERER_URL) return

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://cdn.modrinth.com https://cdn-raw.modrinth.com https://mc-heads.net; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"
        ]
      }
    })
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: '#060607',
    title: 'Odissey Client',
    icon: appIcon(),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay:
      process.platform === 'win32'
        ? { color: '#060607', symbolColor: '#f4f1e8', height: 44 }
        : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('close', (event) => {
    if (ipcLifecycle?.handleWindowClose()) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  const contents = mainWindow.webContents

  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  contents.on('will-navigate', (event, url) => {
    const current = contents.getURL()
    try {
      if (new URL(url).origin !== new URL(current).origin) {
        event.preventDefault()
        if (url.startsWith('https://')) void shell.openExternal(url)
      }
    } catch {
      event.preventDefault()
    }
  })

  contents.on('render-process-gone', (_event, details) => {
    logError('El proceso de interfaz falló', details.reason)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    if (process.env.ODISSEY_VIEW) url.searchParams.set('view', process.env.ODISSEY_VIEW)
    void mainWindow.loadURL(url.toString())
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    app.setAppUserModelId('com.odissey.client')
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false)
    })

    await initLogger(join(app.getPath('userData'), 'logs')).catch(() => undefined)
    log('info', `Odissey Client ${app.getVersion()} iniciado (Electron ${process.versions.electron})`)

    try {
      const database = initDatabase()
      log('info', `Base de datos lista: ${database.path}`)
    } catch (error) {
      logError('No se pudo inicializar la base de datos', error)
    }

    applyCsp()
    ipcLifecycle = registerIpc(() => mainWindow)
    createTray()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  tray?.destroy()
  tray = null
  ipcLifecycle?.shutdown()
  closeDatabase()
})
