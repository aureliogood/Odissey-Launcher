import { contextBridge, ipcRenderer } from 'electron'
import type { LauncherApi, LaunchProgress } from '../shared/types'

const api: LauncherApi = {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
  getAccounts: () => ipcRenderer.invoke('accounts:get'),
  addOfflineAccount: (name) => ipcRenderer.invoke('accounts:add-offline', name),
  removeAccount: (id) => ipcRenderer.invoke('accounts:remove', id),
  selectAccount: (id) => ipcRenderer.invoke('accounts:select', id),
  loginMicrosoft: () => ipcRenderer.invoke('accounts:login-microsoft'),
  cancelMicrosoftLogin: () => ipcRenderer.invoke('accounts:cancel-microsoft-login'),
  getOAuthConfig: () => ipcRenderer.invoke('oauth:get'),
  setOAuthClientId: (clientId) => ipcRenderer.invoke('oauth:set-client-id', clientId),
  listVersions: (force) => ipcRenderer.invoke('versions:list', force),
  listInstalled: () => ipcRenderer.invoke('versions:installed'),
  detectJava: (requiredMajor, force) => ipcRenderer.invoke('java:detect', requiredMajor, force),
  launch: (request) => ipcRenderer.invoke('game:launch', request),
  install: (request) => ipcRenderer.invoke('game:install', request),
  stopGame: () => ipcRenderer.invoke('game:stop'),
  cancelInstall: () => ipcRenderer.invoke('game:cancel-install'),
  pickJava: () => ipcRenderer.invoke('dialog:pick-java'),
  pickDirectory: () => ipcRenderer.invoke('dialog:pick-directory'),
  openPath: (target) => ipcRenderer.invoke('shell:open-path', target),
  openLogs: () => ipcRenderer.invoke('logs:open'),
  getLogPath: () => ipcRenderer.invoke('logs:path'),
  cleanupOldLogs: () => ipcRenderer.invoke('logs:cleanup'),
  exportConfigBackup: () => ipcRenderer.invoke('config:export'),
  importConfigBackup: () => ipcRenderer.invoke('config:import'),
  listRestorePoints: () => ipcRenderer.invoke('restore-points:list'),
  createRestorePoint: (includeWorlds) => ipcRenderer.invoke('restore-points:create', includeWorlds),
  restoreRestorePoint: (id) => ipcRenderer.invoke('restore-points:restore', id),
  listScreenshots: () => ipcRenderer.invoke('screenshots:list'),
  openScreenshotFolder: () => ipcRenderer.invoke('screenshots:open-folder'),
  openScreenshot: (path) => ipcRenderer.invoke('screenshots:open', path),
  getScreenshotData: (path) => ipcRenderer.invoke('screenshots:data', path),
  deleteScreenshot: (path) => ipcRenderer.invoke('screenshots:delete', path),
  copyScreenshot: (path) => ipcRenderer.invoke('screenshots:copy', path),
  notifyReady: () => {
    void ipcRenderer.invoke('app:notify-ready')
  },
  searchCatalog: (request) => ipcRenderer.invoke('catalog:search', request),
  getCatalogProject: (projectId, force) =>
    ipcRenderer.invoke('catalog:project', projectId, force),
  getCatalogVersions: (projectId, force) =>
    ipcRenderer.invoke('catalog:versions', projectId, force),
  getCatalogDependencies: (versionId) =>
    ipcRenderer.invoke('catalog:dependencies', versionId),
  getCatalogCategories: (kind) => ipcRenderer.invoke('catalog:categories', kind),
  getLibraryTarget: () => ipcRenderer.invoke('library:target'),
  listContent: (kind) => ipcRenderer.invoke('library:list', kind),
  installContent: (request) => ipcRenderer.invoke('library:install', request),
  removeContent: (request) => ipcRenderer.invoke('library:remove', request),
  setModEnabled: (projectId, enabled) => ipcRenderer.invoke('library:mod-enabled', projectId, enabled),
  ensureFabric: (gameVersion) => ipcRenderer.invoke('library:ensure-fabric', gameVersion),
  ensureForge: (gameVersion) => ipcRenderer.invoke('library:ensure-forge', gameVersion),
  ensureOptifine: (gameVersion) => ipcRenderer.invoke('library:ensure-optifine', gameVersion),
  openContentFolder: (kind) => ipcRenderer.invoke('library:open-folder', kind),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  cancelLibrary: () => ipcRenderer.invoke('library:cancel'),
  analyzeOptimizer: (force) => ipcRenderer.invoke('optimizer:analyze', force),
  applyOptimizer: (patch, options) => ipcRenderer.invoke('optimizer:apply', patch, options),
  restoreOptimizer: () => ipcRenderer.invoke('optimizer:restore'),
  getOptimizerState: () => ipcRenderer.invoke('optimizer:state'),
  scanGameAssets: () => ipcRenderer.invoke('optimizer:scan-assets'),
  openWindowsGpuSettings: () => ipcRenderer.invoke('optimizer:open-gpu-settings'),
  runDiagnostics: () => ipcRenderer.invoke('diagnostics:run'),
  saveDiagnosticReport: (report) => ipcRenderer.invoke('diagnostics:save', report),
  restoreSettingsBackup: () => ipcRenderer.invoke('settings:restore-backup'),
  getServerStatus: (force) => ipcRenderer.invoke('server:status', force),
  getCommunityContent: (force) => ipcRenderer.invoke('community:content', force),
  addServerToMinecraft: () => ipcRenderer.invoke('server:add'),
  getUpdateInfo: () => ipcRenderer.invoke('update:get'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: LaunchProgress): void =>
      callback(progress)
    ipcRenderer.on('game:progress', listener)
    return () => ipcRenderer.removeListener('game:progress', listener)
  },
  onLibraryProgress: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      progress: Parameters<typeof callback>[0]
    ): void => callback(progress)
    ipcRenderer.on('library:progress', listener)
    return () => ipcRenderer.removeListener('library:progress', listener)
  },
  onLog: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, line: string): void => callback(line)
    ipcRenderer.on('game:log', listener)
    return () => ipcRenderer.removeListener('game:log', listener)
  },
  onServerStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: Parameters<typeof callback>[0]): void =>
      callback(status)
    ipcRenderer.on('server:status-updated', listener)
    return () => ipcRenderer.removeListener('server:status-updated', listener)
  },
  onExit: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, code: number | null): void =>
      callback(code)
    ipcRenderer.on('game:exit', listener)
    return () => ipcRenderer.removeListener('game:exit', listener)
  }
}

contextBridge.exposeInMainWorld('launcher', api)
