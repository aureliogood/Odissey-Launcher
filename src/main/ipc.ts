import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { constants as osConstants, cpus, setPriority, totalmem } from 'node:os'
import { isAbsolute, relative, resolve } from 'node:path'
import type {
  AccountsState,
  CatalogSearchRequest,
  ContentKind,
  DiagnosticReport,
  InstallRequest,
  JavaInfo,
  LaunchProgress,
  LaunchRequest,
  LibraryInstallRequest,
  LibraryProgress,
  OptimizerApplyOptions,
  OptimizerPatch,
  Settings,
  SystemInfo
} from '../shared/types'
import {
  addOfflineAccount,
  getAccountsState,
  removeAccount,
  selectAccount
} from './accounts/store'
import { buildSession, getOAuthInfo, loginMicrosoft, saveOAuthClientId } from './accounts/service'
import { runDiagnostics, saveDiagnosticReport } from './diagnostics'
import { cleanupOldLogs } from './cleanup'
import { exportConfigBackup, importConfigBackup } from './config-backup'
import { getCommunityContent } from './community'
import { createRestorePoint, listRestorePoints, restoreRestorePoint } from './restore-points'
import { scanGameAssets } from './asset-scan'
import { finishLaunch, startLaunch, updateLaunch } from './database'
import { getLogFile, log, logError } from './logger'
import { DiscordPresence } from './discord-presence'
import { flushVerificationCache, initVerificationCache } from './minecraft/http'
import { detectJava } from './minecraft/java'
import { ensureForge, ensureOptifine } from './minecraft/loaders'
import {
  getVersionManifest,
  installVersion,
  launchGame,
  listInstalledVersions,
  readInstalledMarker
} from './minecraft/launch'
import { prepareSharedOptions, saveSharedOptions } from './minecraft/shared-options'
import {
  addServerToMinecraft,
  getCachedServerStatus,
  getServerStatus,
  pendingServerStatus
} from './minecraft/serverlist'
import {
  copyScreenshot,
  deleteScreenshot,
  getScreenshotData,
  listScreenshots,
  openScreenshot,
  openScreenshotFolder
} from './screenshots'
import {
  getCategories,
  getDependencies,
  getProject,
  getVersions,
  searchCatalog
} from './modrinth/client'
import {
  analyzeOptimizer,
  applyOptimizer,
  getOptimizerState,
  restoreOptimizer,
  restoreSettingsBackup
} from './optimizer'
import {
  getContentFolder,
  getLibraryTarget,
  installContent,
  listInstalledContent,
  prepareFabricProfile,
  removeContent,
  setModEnabled
} from './library/service'
import { removeOdisseyOverlay } from './odissey/client'
import { loadSettings, saveSettings } from './store'
import { checkForUpdates, downloadUpdate, getUpdateInfo, installUpdate } from './updater'
import { join } from 'node:path'

interface IpcState {
  launchController: AbortController | null
  installController: AbortController | null
  libraryController: AbortController | null
  loginController: AbortController | null
  currentProcess: ChildProcess | null
  userStoppedGame: boolean
  hiddenForGame: boolean
}

export interface IpcLifecycle {
  shutdown: () => void
  handleWindowClose: () => boolean
  isGameRunning: () => boolean
}

function asString(value: unknown, label: string, maxLength = 512): string {
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new Error(`${label} no válido`)
  }
  return value
}

function isInside(root: string, target: string): boolean {
  const base = resolve(root)
  const full = resolve(target)
  const rel = relative(base, full)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function terminateGame(child: ChildProcess): void {
  if (!child.pid || child.killed) return

  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore'
    })
    killer.on('error', () => child.kill())
    return
  }

  child.kill('SIGTERM')
}

export function registerIpc(getWindow: () => BrowserWindow | null): IpcLifecycle {
  const discordPresence = new DiscordPresence()
  const state: IpcState = {
    launchController: null,
    installController: null,
    libraryController: null,
    loginController: null,
    currentProcess: null,
    userStoppedGame: false,
    hiddenForGame: false
  }

  void loadSettings()
    .then((settings) => {
      if (!settings.cleanLogsOnLaunch) return
      return cleanupOldLogs().then((result) => {
        log('info', `Limpieza de registros: ${result.deletedFiles} archivos antiguos enviados a la papelera`)
      })
    })
    .catch((error) => logError('No se pudieron limpiar registros antiguos', error))

  const asKind = (value: unknown): ContentKind => {
    if (value !== 'mod' && value !== 'resourcepack') throw new Error('Tipo de contenido no válido')
    return value
  }

  const send = (channel: string, payload: unknown): void => {
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload)
  }

  const makeLibraryProgressSender = (
    controller: AbortController
  ): ((progress: LibraryProgress) => void) => {
    let lastSent = 0
    return (progress) => {
      if (controller.signal.aborted) return
      const now = Date.now()
      if (progress.percent >= 100 || now - lastSent > 80) {
        lastSent = now
        send('library:progress', progress)
      }
    }
  }

  const makeProgressSender = (
    controller: AbortController
  ): ((progress: LaunchProgress) => void) => {
    let lastSent = 0
    let lastStage = ''

    return (progress) => {
      if (controller.signal.aborted) return
      const now = Date.now()
      if (
        progress.percent >= 100 ||
        progress.stage !== lastStage ||
        now - lastSent > 90
      ) {
        lastSent = now
        lastStage = progress.stage
        send('game:progress', progress)
      }
    }
  }

  ipcMain.handle('settings:get', () => loadSettings())

  ipcMain.handle('settings:save', (_event, patch: Partial<Settings>) => {
    if (!patch || typeof patch !== 'object') throw new Error('Ajustes no válidos')
    return saveSettings(patch)
  })

  ipcMain.handle('system:info', (): SystemInfo => {
    return {
      totalMemMb: Math.floor(totalmem() / 1024 / 1024),
      cpuCount: cpus().length,
      platform: `${process.platform} ${process.arch}`
    }
  })

  ipcMain.handle('accounts:get', () => getAccountsState())

  ipcMain.handle('accounts:add-offline', (_event, name: string): Promise<AccountsState> => {
    return addOfflineAccount(asString(name, 'Nombre', 32))
  })

  ipcMain.handle('accounts:remove', (_event, id: string): Promise<AccountsState> => {
    return removeAccount(asString(id, 'Identificador', 128))
  })

  ipcMain.handle('accounts:select', (_event, id: string): Promise<AccountsState> => {
    return selectAccount(asString(id, 'Identificador', 128))
  })

  ipcMain.handle('accounts:login-microsoft', async (): Promise<AccountsState> => {
    if (state.loginController) throw new Error('Ya hay un inicio de sesión en curso')

    const controller = new AbortController()
    state.loginController = controller

    try {
      return await loginMicrosoft((url) => {
        const parsed = new URL(url)
        if (parsed.protocol !== 'https:' || parsed.hostname !== 'login.microsoftonline.com') {
          throw new Error('URL de inicio de sesión no válida')
        }
        return shell.openExternal(url)
      }, controller.signal)
    } finally {
      if (state.loginController === controller) state.loginController = null
    }
  })

  ipcMain.handle('accounts:cancel-microsoft-login', () => {
    state.loginController?.abort()
  })

  ipcMain.handle('oauth:get', () => getOAuthInfo())

  ipcMain.handle('oauth:set-client-id', (_event, clientId: string) => {
    return saveOAuthClientId(asString(clientId, 'Client ID', 64))
  })

  ipcMain.handle('versions:list', async (_event, force?: boolean) => {
    const settings = await loadSettings()
    return getVersionManifest(settings.gameDir, force === true)
  })

  ipcMain.handle('versions:installed', async () => {
    const settings = await loadSettings()
    return listInstalledVersions(settings.gameDir)
  })

  ipcMain.handle('java:detect', async (_event, requiredMajor?: number, force?: boolean): Promise<JavaInfo[]> => {
    const major =
      typeof requiredMajor === 'number' && Number.isFinite(requiredMajor)
        ? Math.max(1, Math.min(100, Math.round(requiredMajor)))
        : undefined
    const found = await detectJava(major, undefined, force === true)
    log('info', `Java detectado: ${found.length} instalaciones`)
    return found
  })

  ipcMain.handle('dialog:pick-java', async () => {
    const settings = await loadSettings()
    const result = await dialog.showOpenDialog({
      title: 'Selecciona el ejecutable de Java',
      defaultPath: settings.javaPath || undefined,
      properties: ['openFile'],
      filters:
        process.platform === 'win32'
          ? [{ name: 'Java', extensions: ['exe'] }]
          : [{ name: 'Todos los archivos', extensions: ['*'] }]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:pick-directory', async () => {
    const settings = await loadSettings()
    const result = await dialog.showOpenDialog({
      title: 'Selecciona la carpeta del juego',
      defaultPath: settings.gameDir,
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('shell:open-path', async (_event, target: string) => {
    const value = asString(target, 'Ruta', 2048)
    const settings = await loadSettings()
    const allowed =
      isInside(settings.gameDir, value) || isInside(app.getPath('userData'), value)

    if (!allowed) throw new Error('Solo se pueden abrir carpetas del launcher o del juego')

    const error = await shell.openPath(value)
    if (error) throw new Error(error)
  })

  ipcMain.handle('logs:open', () => {
    const file = getLogFile()
    if (file) shell.showItemInFolder(file)
  })

  ipcMain.handle('logs:path', () => getLogFile())
  ipcMain.handle('logs:cleanup', () => cleanupOldLogs())
  ipcMain.handle('config:export', () => exportConfigBackup())
  ipcMain.handle('config:import', () => importConfigBackup())
  ipcMain.handle('screenshots:list', () => listScreenshots())
  ipcMain.handle('screenshots:open-folder', () => openScreenshotFolder())
  ipcMain.handle('screenshots:open', (_event, target: string) =>
    openScreenshot(asString(target, 'Ruta de captura', 2048))
  )
  ipcMain.handle('screenshots:data', (_event, target: string) =>
    getScreenshotData(asString(target, 'Ruta de captura', 2048))
  )
  ipcMain.handle('screenshots:delete', (_event, target: string) =>
    deleteScreenshot(asString(target, 'Ruta de captura', 2048))
  )
  ipcMain.handle('screenshots:copy', (_event, target: string) =>
    copyScreenshot(asString(target, 'Ruta de captura', 2048))
  )

  ipcMain.handle('game:install', async (_event, request: InstallRequest) => {
    if (state.currentProcess) throw new Error('Cierra Minecraft antes de instalar otra versión')
    if (state.installController) throw new Error('Ya hay una instalación en curso')
    if (state.libraryController) throw new Error('Espera a que termine la instalación de contenido')

    const versionId = asString(request?.versionId, 'Versión', 64)
    await createRestorePoint(false).catch((error) => {
      logError('No se pudo crear un punto automático antes de instalar la versión', error)
      throw new Error(`Se canceló la instalación porque no se pudo crear el punto de restauración: ${error instanceof Error ? error.message : 'error desconocido'}`)
    })
    const settings = await loadSettings()
    const controller = new AbortController()
    state.installController = controller
    await initVerificationCache(join(settings.gameDir, '.odissey', 'verified.json'))

    try {
      await installVersion({
        versionId,
        root: settings.gameDir,
        signal: controller.signal,
        onProgress: makeProgressSender(controller)
      })
      log('info', `Versión instalada: ${versionId}`)
    } catch (error) {
      if (!controller.signal.aborted) {
        logError(`Error instalando ${versionId}`, error)
        throw error
      }
    } finally {
      void flushVerificationCache()
      if (state.installController === controller) state.installController = null
    }
  })

  ipcMain.handle('game:launch', async (_event, request: LaunchRequest) => {
    if (state.currentProcess) throw new Error('Minecraft ya está en ejecución')
    if (state.installController) throw new Error('Espera a que termine la instalación en curso')
    if (state.libraryController) throw new Error('Espera a que termine la instalación de contenido')
    if (state.launchController) throw new Error('Ya se está iniciando Minecraft')

    const requestedVersionId = asString(request?.versionId, 'Versión', 64)
    const quickPlayServer =
      typeof request?.quickPlayServer === 'string' && request.quickPlayServer.trim()
        ? asString(request.quickPlayServer, 'Servidor', 255)
        : undefined
    if (quickPlayServer && !/^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(quickPlayServer)) {
      throw new Error('Dirección de servidor no válida')
    }
    const settings = await loadSettings()
    const controller = new AbortController()
    state.launchController = controller
    let historyId = 0
    let versionId = requestedVersionId

    try {
      historyId = startLaunch({
        versionId: requestedVersionId,
        instanceDir: settings.gameDir
      })
      await initVerificationCache(join(settings.gameDir, '.odissey', 'verified.json'))
      const sendProgress = makeProgressSender(controller)
      sendProgress({ stage: 'starting', message: 'Comprobando cuenta...', percent: 0 })

      const session = await buildSession(controller.signal)
      updateLaunch(historyId, {
        accountName: session.name,
        accountType: session.userType
      })
      const marker = await readInstalledMarker(settings.gameDir, versionId)
      const instanceDir =
        marker?.kind === 'fabric'
          ? join(settings.gameDir, 'instances', versionId)
          : undefined
      if (instanceDir) {
        await removeOdisseyOverlay(instanceDir)
        await prepareSharedOptions(settings.gameDir, instanceDir)
      }

      await saveSettings({ selectedVersion: versionId })

      const game = await launchGame({
        versionId,
        session,
        ramMb: settings.ramMb,
        root: settings.gameDir,
        instanceDir,
        quickPlayServer,
        javaPath: settings.javaPath || undefined,
        extraJvmArgs: settings.extraJvmArgs,
        customResolution: settings.customResolution,
        // Keep the Electron process alive so it can restore the launcher when Minecraft exits.
        autoCloseLauncher: false,
        resolutionWidth: settings.resolutionWidth,
        resolutionHeight: settings.resolutionHeight,
        signal: controller.signal,
        onProgress: sendProgress,
        onLog: (line) => send('game:log', line)
      })

      state.currentProcess = game.process
      state.userStoppedGame = false
      discordPresence.start(game.process.pid)
      if (settings.highPriorityGame && game.process.pid) {
        try {
          setPriority(game.process.pid, osConstants.priority.PRIORITY_HIGH)
          log('info', 'Prioridad alta aplicada al proceso de Minecraft')
        } catch (error) {
          logError('No se pudo cambiar la prioridad de Minecraft', error)
        }
      }
      updateLaunch(historyId, {
        versionId,
        instanceDir: instanceDir ?? settings.gameDir,
        status: 'running'
      })
      log('info', `Minecraft iniciado: ${versionId} (pid ${game.process.pid ?? '?'})`)
      if (settings.minimizeToTrayOnGameStart || settings.autoCloseLauncherOnGameStart) {
        state.hiddenForGame = true
        getWindow()?.hide()
      }
      if (settings.autoCloseLauncherOnGameStart) {
        log('info', 'Launcher oculto; volverá al cerrar Minecraft')
      }

      game.process.once('exit', async (code) => {
        const stoppedByUser = state.userStoppedGame
        const restoreAfterGame = state.hiddenForGame
        state.userStoppedGame = false
        state.hiddenForGame = false
        discordPresence.stop()
        if (instanceDir) {
          await saveSharedOptions(settings.gameDir, instanceDir).catch((error) => {
            logError('No se pudieron guardar los ajustes compartidos de Minecraft', error)
          })
        }
        if (state.currentProcess === game.process) state.currentProcess = null
        finishLaunch(historyId, 'exited', code)
        log('info', `Minecraft finalizó con código ${code ?? 'null'}`)
        if (restoreAfterGame || (!stoppedByUser && code !== 0)) {
          const window = getWindow()
          if (window && !window.isDestroyed()) {
            window.show()
            window.focus()
          }
        }
        const exitCode = stoppedByUser ? 0 : code
        send('game:exit', exitCode)
      })

      return { pid: game.process.pid, versionId }
    } catch (error) {
      if (!controller.signal.aborted) {
        logError(`No se pudo iniciar ${requestedVersionId}`, error)
      }
      if (historyId) {
        finishLaunch(historyId, controller.signal.aborted ? 'cancelled' : 'failed', null, error)
      }
      throw error
    } finally {
      void flushVerificationCache()
      if (state.launchController === controller) state.launchController = null
    }
  })

  ipcMain.handle('game:cancel-install', () => {
    state.installController?.abort()
  })

  ipcMain.handle('game:stop', () => {
    state.launchController?.abort()
    state.installController?.abort()
    state.libraryController?.abort()

    if (state.currentProcess) {
      state.userStoppedGame = true
      terminateGame(state.currentProcess)
    }
  })

  ipcMain.handle('catalog:search', (_event, request: CatalogSearchRequest) => {
    if (!request || typeof request !== 'object') throw new Error('Búsqueda no válida')
    asKind(request.kind)
    if (typeof request.query !== 'string' || request.query.length > 100) {
      throw new Error('Consulta no válida')
    }
    return searchCatalog(request)
  })

  ipcMain.handle('catalog:project', (_event, projectId: string, force?: boolean) => {
    return getProject(asString(projectId, 'Proyecto', 64), undefined, force === true)
  })

  ipcMain.handle('catalog:versions', (_event, projectId: string, force?: boolean) => {
    return getVersions(asString(projectId, 'Proyecto', 64), undefined, force === true)
  })

  ipcMain.handle('catalog:dependencies', (_event, versionId: string) => {
    return getDependencies(asString(versionId, 'Versión de proyecto', 64))
  })

  ipcMain.handle('catalog:categories', (_event, kind: ContentKind) => {
    return getCategories(asKind(kind))
  })

  ipcMain.handle('shell:open-external', async (_event, target: string) => {
    const value = asString(target, 'Enlace', 2048)
    let url: URL
    try {
      url = new URL(value)
    } catch {
      throw new Error('Enlace no válido')
    }

    const host = url.hostname.toLowerCase()
    const allowed =
      url.protocol === 'https:' &&
      (host === 'modrinth.com' ||
        host.endsWith('.modrinth.com') ||
        host === 'github.com' ||
        host === 'discord.com' ||
        host.endsWith('.discord.com') ||
        host === 'discord.gg' ||
        host === 'odisseymc.site' ||
        host.endsWith('.odisseymc.site'))

    if (!allowed) throw new Error('Solo se pueden abrir enlaces de Modrinth, GitHub o Discord')
    await shell.openExternal(url.toString())
  })

  ipcMain.handle('library:target', () => getLibraryTarget())

  ipcMain.handle('library:list', (_event, kind: ContentKind) => {
    return listInstalledContent(asKind(kind))
  })

  ipcMain.handle('library:install', async (_event, request: LibraryInstallRequest) => {
    if (state.currentProcess) throw new Error('Cierra Minecraft antes de instalar contenido')
    if (state.installController || state.libraryController) {
      throw new Error('Ya hay una instalación en curso')
    }
    if (state.launchController) throw new Error('Espera a que Minecraft termine de iniciarse')

    if (!request || typeof request !== 'object') throw new Error('Solicitud no válida')
    const kind = asKind(request.kind)
    const projectId = asString(request.projectId, 'Proyecto', 64)
    await createRestorePoint(false)
    if (request.versionId !== undefined) {
      asString(request.versionId, 'Versión de proyecto', 64)
    }

    const controller = new AbortController()
    state.libraryController = controller
    const settings = await loadSettings()
    await initVerificationCache(join(settings.gameDir, '.odissey', 'verified.json'))

    try {
      const result = await installContent(
        { kind, projectId, versionId: request.versionId },
        controller.signal,
        makeLibraryProgressSender(controller)
      )
      log('info', `Contenido instalado: ${kind} ${projectId}`)
      return result
    } catch (error) {
      if (!controller.signal.aborted) {
        logError(`Error instalando contenido ${projectId}`, error)
      }
      throw error
    } finally {
      void flushVerificationCache()
      if (state.libraryController === controller) state.libraryController = null
    }
  })

  ipcMain.handle('library:mod-enabled', async (_event, projectId: string, enabled: boolean) => {
    if (state.currentProcess) throw new Error('Cierra Minecraft antes de cambiar mods')
    if (state.libraryController) throw new Error('Espera a que termine la instalación de contenido')
    await createRestorePoint(false)
    const result = await setModEnabled(asString(projectId, 'Mod', 300), enabled === true)
    log('info', `Mod ${projectId}: ${enabled ? 'activado' : 'desactivado'}`)
    return result
  })

  ipcMain.handle('library:remove', async (_event, request: LibraryInstallRequest) => {
    if (state.currentProcess) throw new Error('Cierra Minecraft antes de quitar contenido')
    if (state.libraryController) throw new Error('Espera a que termine la instalación de contenido')

    if (!request || typeof request !== 'object') throw new Error('Solicitud no válida')
    const kind = asKind(request.kind)
    const projectId = asString(request.projectId, 'Proyecto', 64)
    await createRestorePoint(false)
    const result = await removeContent(kind, projectId)
    log('info', `Contenido eliminado: ${kind} ${projectId}`)
    return result
  })

  ipcMain.handle('library:open-folder', async (_event, kind: ContentKind) => {
    const folder = await getContentFolder(asKind(kind))
    const error = await shell.openPath(folder)
    if (error) throw new Error(error)
  })

  ipcMain.handle('library:ensure-fabric', async (_event, gameVersion: string) => {
    if (state.currentProcess) throw new Error('Cierra Minecraft antes de preparar Fabric')
    if (state.installController || state.libraryController) {
      throw new Error('Ya hay una instalación en curso')
    }
    if (state.launchController) throw new Error('Espera a que Minecraft termine de iniciarse')

    const version = asString(gameVersion, 'Versión de Minecraft', 64)
    const controller = new AbortController()
    state.libraryController = controller
    const settings = await loadSettings()
    await initVerificationCache(join(settings.gameDir, '.odissey', 'verified.json'))

    try {
      const info = await prepareFabricProfile(
        version,
        controller.signal,
        makeLibraryProgressSender(controller)
      )
      await saveSettings({ selectedVersion: info.profileId })
      log('info', `Perfil Fabric preparado: ${info.profileId}`)
      return info
    } catch (error) {
      if (!controller.signal.aborted) {
        logError(`Error preparando Fabric para ${version}`, error)
      }
      throw error
    } finally {
      void flushVerificationCache()
      if (state.libraryController === controller) state.libraryController = null
    }
  })

  const ensureExternalLoader = async (gameVersion: string, kind: 'forge' | 'optifine') => {
    if (state.currentProcess) throw new Error('Cierra Minecraft antes de instalar un cargador')
    if (state.installController || state.libraryController) throw new Error('Ya hay una instalación en curso')
    if (state.launchController) throw new Error('Espera a que Minecraft termine de iniciarse')
    const version = asString(gameVersion, 'Versión de Minecraft', 64)
    const controller = new AbortController()
    state.libraryController = controller
    const settings = await loadSettings()
    await initVerificationCache(join(settings.gameDir, '.odissey', 'verified.json'))
    try {
      const installOptions = {
        root: settings.gameDir,
        baseVersion: version,
        javaPath: settings.javaPath || undefined,
        signal: controller.signal,
        onProgress: makeProgressSender(controller)
      }
      const info = kind === 'forge' ? await ensureForge(installOptions) : await ensureOptifine(installOptions)
      await saveSettings({ selectedVersion: info.profileId })
      log('info', `Perfil ${kind} preparado: ${info.profileId}`)
      return info
    } catch (error) {
      if (!controller.signal.aborted) logError(`Error instalando ${kind} para ${version}`, error)
      throw error
    } finally {
      void flushVerificationCache()
      if (state.libraryController === controller) state.libraryController = null
    }
  }

  ipcMain.handle('library:ensure-forge', (_event, gameVersion: string) => ensureExternalLoader(gameVersion, 'forge'))
  ipcMain.handle('library:ensure-optifine', (_event, gameVersion: string) => ensureExternalLoader(gameVersion, 'optifine'))

  ipcMain.handle('library:cancel', () => {
    state.libraryController?.abort()
  })

  ipcMain.handle('optimizer:analyze', (_event, force?: boolean) => {
    return analyzeOptimizer(force === true)
  })

  ipcMain.handle(
    'optimizer:apply',
    async (_event, patch: OptimizerPatch, options: OptimizerApplyOptions) => {
      if (!patch || typeof patch !== 'object' || !options || typeof options !== 'object') {
        throw new Error('Recomendación no válida')
      }
      const safePatch: OptimizerPatch = {
        ramMb: Number(patch.ramMb),
        javaPath: typeof patch.javaPath === 'string' ? patch.javaPath.slice(0, 2048) : '',
        extraJvmArgs:
          typeof patch.extraJvmArgs === 'string' ? patch.extraJvmArgs.slice(0, 2000) : ''
      }
      const safeOptions: OptimizerApplyOptions = {
        applyRam: options.applyRam === true,
        applyJava: options.applyJava === true,
        applyJvm: options.applyJvm === true
      }
      return applyOptimizer(safePatch, safeOptions)
    }
  )

  ipcMain.handle('optimizer:restore', () => restoreOptimizer())
  ipcMain.handle('optimizer:state', () => getOptimizerState())
  ipcMain.handle('optimizer:scan-assets', () => scanGameAssets())
  ipcMain.handle('optimizer:open-gpu-settings', async () => {
    if (process.platform !== 'win32') throw new Error('El ajuste de GPU dedicada está disponible en Windows')
    await shell.openExternal('ms-settings:display-advancedgraphics')
  })

  ipcMain.handle('diagnostics:run', () => runDiagnostics())

  ipcMain.handle('diagnostics:save', (_event, report: DiagnosticReport) => {
    return saveDiagnosticReport(report)
  })

  ipcMain.handle('settings:restore-backup', () => restoreSettingsBackup())

  ipcMain.handle('restore-points:list', () => listRestorePoints())
  ipcMain.handle('restore-points:create', async (_event, includeWorlds: boolean) => {
    if (state.currentProcess) throw new Error('Cierra Minecraft antes de crear un punto de restauración')
    return createRestorePoint(includeWorlds === true)
  })
  ipcMain.handle('restore-points:restore', async (_event, id: string) => {
    if (state.currentProcess) throw new Error('Cierra Minecraft antes de restaurar un punto')
    await restoreRestorePoint(asString(id, 'Punto de restauración', 120))
    return listRestorePoints()
  })

  ipcMain.handle('server:status', async (_event, force?: boolean) => {
    if (force === true) return getServerStatus(true)
    const cached = await getCachedServerStatus()
    void getServerStatus(false).then(
      (status) => send('server:status-updated', status),
      (error) => logError('No se pudo actualizar el estado de Odissey', error)
    )
    return cached ?? pendingServerStatus()
  })

  ipcMain.handle('community:content', (_event, force?: boolean) => getCommunityContent(force === true))

  ipcMain.handle('server:add', async () => {
    if (state.currentProcess) throw new Error('Cierra Minecraft antes de modificar la lista de servidores')
    const settings = await loadSettings()
    const marker = settings.selectedVersion
      ? await readInstalledMarker(settings.gameDir, settings.selectedVersion)
      : null
    const instanceDir =
      marker?.kind === 'fabric' && settings.selectedVersion
        ? join(settings.gameDir, 'instances', settings.selectedVersion)
        : settings.gameDir
    return addServerToMinecraft(instanceDir)
  })

  ipcMain.handle('update:get', () => getUpdateInfo())
  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.handle('update:download', () => downloadUpdate())

  ipcMain.handle('update:install', async () => {
    if (state.currentProcess) throw new Error('Cierra Minecraft antes de instalar una actualización')
    if (state.installController || state.libraryController) {
      throw new Error('Espera a que termine la operación actual')
    }
    return installUpdate()
  })

  ipcMain.handle('app:notify-ready', () => {
    log('info', `Interfaz lista (${Math.round(process.uptime() * 1000)} ms desde el arranque)`)
  })

  return {
    handleWindowClose: () => {
      if (!state.currentProcess) return false
      state.hiddenForGame = true
      log('info', 'Launcher oculto mientras Minecraft sigue abierto')
      return true
    },
    isGameRunning: () => Boolean(state.currentProcess),
    shutdown: () => {
      state.launchController?.abort()
      state.installController?.abort()
      state.libraryController?.abort()
      state.loginController?.abort()
      if (state.currentProcess) terminateGame(state.currentProcess)
      discordPresence.stop()
      void flushVerificationCache()
    }
  }
}
