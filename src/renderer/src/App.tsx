import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode
} from 'react'
import type {
  AccountsState,
  CommunityContent,
  DiagnosticReport,
  FabricProfileInfo,
  InstalledVersion,
  JavaInfo,
  LaunchProgress,
  OAuthConfigInfo,
  ServerStatus,
  Settings,
  SystemInfo,
  VersionManifest
} from '../../shared/types'
import { Icon, Logo, type IconName } from './components/Icons'
import { PlayView, type GameState } from './components/PlayView'
import { Button, Modal, ToastHost, type ToastItem, type ToastTone } from './components/UI'

const AccountsView = lazy(() =>
  import('./components/AccountsView').then((module) => ({ default: module.AccountsView }))
)
const CatalogView = lazy(() =>
  import('./components/CatalogView').then((module) => ({ default: module.CatalogView }))
)
const DiagnosticsView = lazy(() =>
  import('./components/DiagnosticsView').then((module) => ({ default: module.DiagnosticsView }))
)
const OptimizerView = lazy(() =>
  import('./components/OptimizerView').then((module) => ({ default: module.OptimizerView }))
)
const SettingsView = lazy(() =>
  import('./components/SettingsView').then((module) => ({ default: module.SettingsView }))
)
const ScreenshotsView = lazy(() =>
  import('./components/ScreenshotsView').then((module) => ({ default: module.ScreenshotsView }))
)
const VersionsView = lazy(() =>
  import('./components/VersionsView').then((module) => ({ default: module.VersionsView }))
)

type View =
  | 'play'
  | 'versions'
  | 'accounts'
  | 'mods'
  | 'textures'
  | 'optimizer'
  | 'diagnostics'
  | 'screenshots'
  | 'settings'

interface Activity {
  kind: 'launch' | 'install'
  versionId: string
}

const viewTitles: Record<View, { title: string; subtitle: string }> = {
  play: { title: 'Jugar', subtitle: 'ODISSEY CLIENT  /  MINECRAFT JAVA' },
  versions: { title: 'Versiones', subtitle: 'VERSIONES DE MINECRAFT Y PERFILES' },
  accounts: { title: 'Cuentas', subtitle: 'CUENTAS Y SESIONES' },
  mods: { title: 'Mods', subtitle: 'BIBLIOTECA DE MODS' },
  textures: { title: 'Texturas', subtitle: 'PAQUETES DE RECURSOS' },
  optimizer: { title: 'Optimizador', subtitle: 'RENDIMIENTO DEL JUEGO' },
  diagnostics: { title: 'Registro Minecraft', subtitle: 'REGISTROS Y DIAGNÓSTICOS' },
  screenshots: { title: 'Capturas', subtitle: 'CAPTURAS DE MINECRAFT' },
  settings: { title: 'Ajustes', subtitle: 'PREFERENCIAS DEL LAUNCHER' }
}

const navItems: Array<{ view: View; label: string; icon: IconName }> = [
  { view: 'play', label: 'Jugar', icon: 'play' },
  { view: 'versions', label: 'Versiones', icon: 'versions' },
  { view: 'accounts', label: 'Cuentas', icon: 'users' },
  { view: 'mods', label: 'Mods', icon: 'puzzle' },
  { view: 'textures', label: 'Texturas', icon: 'image' },
  { view: 'optimizer', label: 'Optimizador', icon: 'sparkles' },
  { view: 'diagnostics', label: 'Registro', icon: 'terminal' },
  { view: 'screenshots', label: 'Capturas', icon: 'image' },
  { view: 'settings', label: 'Ajustes', icon: 'settings' }
]

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  }
  return 'Ha ocurrido un error inesperado'
}

function initialSidebarLocked(): boolean {
  try {
    return window.localStorage.getItem('odyssey:sidebar-locked') === '1'
  } catch {
    return false
  }
}

function Shell({ children, paused }: { children: ReactNode; paused: boolean }): JSX.Element {
  return <div className={`app-shell ${paused ? 'animations-paused' : ''}`}>{children}</div>
}

const views: View[] = [
  'play',
  'versions',
  'accounts',
  'mods',
  'textures',
  'optimizer',
  'diagnostics',
  'screenshots',
  'settings'
]

function initialView(): View {
  if (import.meta.env.DEV) {
    const requested = new URLSearchParams(window.location.search).get('view')
    if (requested && views.includes(requested as View)) return requested as View
  }
  try {
    const saved = window.localStorage.getItem('odyssey:last-view')
    if (saved && views.includes(saved as View)) return saved as View
  } catch {
    // Sigue con Jugar si el almacenamiento local no está disponible.
  }
  return 'play'
}

export default function App(): JSX.Element {
  const [view, setView] = useState<View>(initialView)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [accounts, setAccounts] = useState<AccountsState | null>(null)
  const [oauth, setOauth] = useState<OAuthConfigInfo | null>(null)
  const [manifest, setManifest] = useState<VersionManifest | null>(null)
  const [installed, setInstalled] = useState<InstalledVersion[]>([])
  const [javaList, setJavaList] = useState<JavaInfo[]>([])
  const [javaLoading, setJavaLoading] = useState(false)
  const [javaScanned, setJavaScanned] = useState(false)
  const [logPath, setLogPath] = useState('')
  const [versionsLoading, setVersionsLoading] = useState(true)
  const [versionsError, setVersionsError] = useState<string | null>(null)
  const [gameState, setGameState] = useState<GameState>('idle')
  const [activity, setActivity] = useState<Activity | null>(null)
  const [progress, setProgress] = useState<LaunchProgress | null>(null)
  const [loginPending, setLoginPending] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [libraryRefresh, setLibraryRefresh] = useState(0)
  const [server, setServer] = useState<ServerStatus | null>(null)
  const [serverLoading, setServerLoading] = useState(false)
  const [serverAdding, setServerAdding] = useState(false)
  const [community, setCommunity] = useState<CommunityContent | null>(null)
  const [communityLoading, setCommunityLoading] = useState(false)
  const [sidebarLocked, setSidebarLocked] = useState(initialSidebarLocked)
  const [networkOnline, setNetworkOnline] = useState(() => navigator.onLine)
  const [liveLogs, setLiveLogs] = useState<string[]>([])
  const [windowFocused, setWindowFocused] = useState(() => document.hasFocus())
  const [crashNotice, setCrashNotice] = useState<{
    code: number | null
    report: DiagnosticReport | null
  } | null>(null)

  const toastId = useRef(0)
  const updateNotified = useRef(false)
  const pendingSettings = useRef<Partial<Settings>>({})
  const settingsTimer = useRef<number | undefined>(undefined)
  const cancelled = useRef(false)
  const didNotify = useRef(false)

  const pushToast = useCallback((message: string, tone: ToastTone = 'info') => {
    toastId.current += 1
    const id = toastId.current
    setToasts((current) => [...current.slice(-3), { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4800)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const loadInstalled = useCallback(async () => {
    try {
      setInstalled(await window.launcher.listInstalled())
    } catch {
      // La lista de instaladas es informativa
    }
  }, [])

  const loadVersions = useCallback(
    async (force = false) => {
      setVersionsLoading(true)
      setVersionsError(null)
      try {
        setManifest(await window.launcher.listVersions(force))
      } catch (error) {
        setVersionsError(errorMessage(error))
      } finally {
        setVersionsLoading(false)
      }
    },
    []
  )

  const loadJava = useCallback(async (force = false) => {
    setJavaLoading(true)
    try {
      setJavaList(await window.launcher.detectJava(undefined, force))
    } catch {
      setJavaList([])
    } finally {
      setJavaLoading(false)
      setJavaScanned(true)
    }
  }, [])

  const loadServer = useCallback(async (force = false) => {
    setServerLoading(true)
    try {
      const result = await window.launcher.getServerStatus(force)
      setServer(result)
      // Si online===null el servidor sigue comprobándose en segundo plano;
      // el spinner se apagará cuando llegue el evento onServerStatus.
      // Si es force, siempre apagamos el spinner al terminar.
      if (force || result.online !== null) setServerLoading(false)
    } catch (error) {
      setServer({
        host: 'mc.odisseymc.lat',
        port: 25569,
        online: false,
        playersOnline: null,
        playersMax: null,
        motd: null,
        version: null,
        favicon: null,
        latencyMs: null,
        checkedAt: new Date().toISOString(),
        error: errorMessage(error),
        cached: false
      })
      setServerLoading(false)
    }
  }, [])

  const loadCommunity = useCallback(async (force = false) => {
    setCommunityLoading(true)
    try {
      setCommunity(await window.launcher.getCommunityContent(force))
    } catch (error) {
      setCommunity((current) => current ? { ...current, error: errorMessage(error) } : null)
    } finally {
      setCommunityLoading(false)
    }
  }, [])

  const flushSettings = useCallback(() => {
    window.clearTimeout(settingsTimer.current)
    const patch = pendingSettings.current
    if (Object.keys(patch).length === 0) return
    pendingSettings.current = {}

    void window.launcher
      .saveSettings(patch)
      .then((saved) => {
        setSettings((current) => (current ? { ...current, ...saved } : current))
        if (patch.gameDir !== undefined) {
          void loadVersions()
          void loadInstalled()
        }
      })
      .catch((error) => pushToast(errorMessage(error), 'error'))
  }, [loadInstalled, loadVersions, pushToast])

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((current) => (current ? { ...current, ...patch } : current))
      pendingSettings.current = { ...pendingSettings.current, ...patch }
      window.clearTimeout(settingsTimer.current)
      settingsTimer.current = window.setTimeout(flushSettings, 280)
    },
    [flushSettings]
  )

  useEffect(() => {
    let active = true

    void window.launcher
      .getSettings()
      .then((loaded) => {
        if (!active) return
        setSettings(loaded)
        setLogPath('')
      })
      .catch((error) => {
        if (active) pushToast(errorMessage(error), 'error')
      })

    void window.launcher.getSystemInfo().then(setSystem).catch(() => undefined)
    void window.launcher.getAccounts().then(setAccounts).catch(() => undefined)
    void window.launcher.getOAuthConfig().then(setOauth).catch(() => undefined)
    void window.launcher.getLogPath().then(setLogPath).catch(() => undefined)
    void loadVersions()
    void loadInstalled()

    const serverTimer = window.setTimeout(() => void loadServer(), 0)
    const serverRefresh = window.setInterval(() => void loadServer(), 65_000)
    const communityTimer = window.setTimeout(() => void loadCommunity(), 0)
    const communityRefresh = window.setInterval(() => void loadCommunity(true), 10 * 60_000)

    return () => {
      active = false
      window.clearTimeout(serverTimer)
      window.clearInterval(serverRefresh)
      window.clearTimeout(communityTimer)
      window.clearInterval(communityRefresh)
    }
  }, [loadCommunity, loadInstalled, loadJava, loadServer, loadVersions, pushToast])

  useEffect(() => {
    if (view === 'settings' && !javaScanned && !javaLoading) void loadJava()
  }, [view, javaLoading, javaScanned, loadJava])

  useEffect(() => {
    if (!settings?.checkUpdatesOnStart || updateNotified.current) return
    const timer = window.setTimeout(() => {
      void window.launcher
        .checkForUpdates()
        .then((info) => {
          if (info.available && !updateNotified.current) {
            updateNotified.current = true
            pushToast(`Actualización ${info.latestVersion} disponible en Ajustes`, 'info')
          }
        })
        .catch(() => undefined)
    }, 8000)
    return () => window.clearTimeout(timer)
  }, [settings?.checkUpdatesOnStart, pushToast])

  useEffect(() => {
    const offProgress = window.launcher.onProgress((next) => setProgress(next))
    const offLogs = window.launcher.onLog((line) => {
      const clean = line
        .replace(/\u001b\[[0-9;]*m/g, '')
        .replace(/(access[_-]?token|refresh[_-]?token|authorization|bearer)(\s*[:=]\s*)[^\s,;"']+/gi, '$1$2[redactado]')
        .slice(0, 5000)
      setLiveLogs((current) => [...current.slice(-799), clean])
    })
    const offServer = window.launcher.onServerStatus((next) => {
      setServer(next)
      setServerLoading(false)
    })

    const offExit = window.launcher.onExit((code) => {
      setGameState('idle')
      setActivity(null)
      setProgress(null)
      void loadInstalled()
      if (code !== 0) {
        pushToast(`Minecraft finalizó con código ${code ?? 'desconocido'}`, 'error')
        setCrashNotice({ code, report: null })
        void window.launcher.runDiagnostics().then(
          (report) => setCrashNotice((current) => (current ? { ...current, report } : current)),
          () =>
            setCrashNotice((current) =>
              current
                ? {
                    ...current,
                    report: {
                      generatedAt: new Date().toISOString(),
                      files: [],
                      truncated: false,
                      crashLog: null,
                      issues: [],
                      summary: { critical: 0, warning: 0, info: 0 }
                    }
                  }
                : current
            )
        )
      }
    })

    return () => {
      offProgress()
      offLogs()
      offServer()
      offExit()
    }
  }, [loadInstalled, pushToast])

  useEffect(() => {
    const updateFocus = (): void => setWindowFocused(document.hasFocus() && !document.hidden)
    window.addEventListener('focus', updateFocus)
    window.addEventListener('blur', updateFocus)
    document.addEventListener('visibilitychange', updateFocus)
    return () => {
      window.removeEventListener('focus', updateFocus)
      window.removeEventListener('blur', updateFocus)
      document.removeEventListener('visibilitychange', updateFocus)
    }
  }, [])

  useEffect(() => {
    if (!settings || !manifest) return
    if (settings.selectedVersion.startsWith('fabric-loader-')) return
    const exists =
      manifest.versions.some((version) => version.id === settings.selectedVersion) ||
      installed.some((version) => version.id === settings.selectedVersion)
    if (!exists) {
      const fallback =
        manifest.latest.release ||
        manifest.versions.find((version) => version.type === 'release')?.id ||
        manifest.versions[0]?.id ||
        ''
      if (fallback) updateSettings({ selectedVersion: fallback })
    }
  }, [manifest, installed, settings, updateSettings])

  useEffect(() => {
    if (didNotify.current) return
    didNotify.current = true
    const frame = requestAnimationFrame(() => window.launcher.notifyReady())
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const flush = (): void => flushSettings()
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [flushSettings])

  const selectedAccount =
    accounts?.accounts.find((account) => account.id === accounts.selectedId) ?? null
  const busy = gameState !== 'idle' || activity !== null
  const offlineMode = !networkOnline || Boolean(community?.error && server?.online === false)
  const ramCeiling = Math.floor(((system?.totalMemMb ?? 8192) * 0.8) / 512) * 512
  const canRetryWithMoreRam = Boolean(
    settings && settings.ramMb + 1024 <= ramCeiling && (
      crashNotice?.code === 1 || /outofmemory|java heap space|insufficient memory/i.test(
        `${crashNotice?.report?.issues[0]?.title ?? ''} ${crashNotice?.report?.issues[0]?.cause ?? ''}`
      )
    )
  )
  const meta = viewTitles[view]

  const handleLaunch = async (quickPlayServer?: string): Promise<void> => {
    if (!settings?.selectedVersion) return
    if (activity) {
      pushToast('Espera a que termine la operación actual', 'info')
      return
    }
    if (!selectedAccount) {
      setView('accounts')
      pushToast('Añade o selecciona una cuenta para jugar', 'info')
      return
    }

    cancelled.current = false
    setActivity({ kind: 'launch', versionId: settings.selectedVersion })
    setGameState('preparing')
    setProgress({ stage: 'starting', message: 'Comprobando cuenta...', percent: 0 })

    try {
      const launched = await window.launcher.launch({
        versionId: settings.selectedVersion,
        quickPlayServer
      })
      setGameState('running')
      setActivity(null)
      if (launched.versionId !== settings.selectedVersion) {
        setSettings(await window.launcher.getSettings())
      }
      void loadInstalled()
      void window.launcher.getAccounts().then(setAccounts).catch(() => undefined)
    } catch (error) {
      if (cancelled.current) {
        pushToast('Inicio cancelado', 'info')
      } else {
        pushToast(errorMessage(error), 'error')
      }
      setGameState('idle')
      setActivity(null)
      setProgress(null)
    } finally {
      cancelled.current = false
    }
  }

  const retryAfterCrashWithMoreRam = async (): Promise<void> => {
    if (!settings || !canRetryWithMoreRam) return
    const ramMb = settings.ramMb + 1024
    try {
      const saved = await window.launcher.saveSettings({ ramMb })
      setSettings(saved)
      setCrashNotice(null)
      pushToast(`Reintentando con ${(ramMb / 1024).toFixed(ramMb % 1024 ? 1 : 0)} GB de RAM`, 'info')
      await handleLaunch()
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }

  const handleStop = async (): Promise<void> => {
    cancelled.current = true
    try {
      await window.launcher.stopGame()
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    } finally {
      // Si estábamos preparando (proceso no llegó a crearse), reseteamos
      // inmediatamente. Si ya estaba 'running', el evento onExit se encarga.
      // Usamos la ref del estado actual para evitar cerrar sobre un valor stale.
      setGameState((current) => {
        if (current === 'preparing') {
          setActivity(null)
          setProgress(null)
          return 'idle'
        }
        return current
      })
    }
  }

  const handleInstall = async (versionId: string): Promise<void> => {
    if (busy) return
    setActivity({ kind: 'install', versionId })
    setProgress({ stage: 'manifest', message: 'Preparando instalación...', percent: 0 })

    try {
      await window.launcher.install({ versionId })
      pushToast(`${versionId} instalada y verificada`, 'success')
      await loadInstalled()
    } catch (error) {
      const message = errorMessage(error)
      if (/cancel/i.test(message)) {
        pushToast('Instalación cancelada', 'info')
      } else {
        pushToast(message, 'error')
      }
    } finally {
      setActivity(null)
      setProgress(null)
    }
  }

  const handleInstallFabricVersion = async (versionId: string): Promise<void> => {
    if (busy) return
    setActivity({ kind: 'install', versionId })
    setProgress({ stage: 'version', message: `Preparando Fabric para ${versionId}...`, percent: 0 })
    try {
      await window.launcher.ensureFabric(versionId)
      pushToast(`Fabric instalado para Minecraft ${versionId}`, 'success')
      await loadInstalled()
      setSettings(await window.launcher.getSettings())
      setLibraryRefresh((value) => value + 1)
    } catch (error) {
      const message = errorMessage(error)
      if (/cancel/i.test(message)) pushToast('Instalación cancelada', 'info')
      else pushToast(message, 'error')
    } finally {
      setActivity(null)
      setProgress(null)
    }
  }

  const handleInstallExternalLoader = async (versionId: string, kind: 'forge' | 'optifine'): Promise<void> => {
    if (busy) return
    setActivity({ kind: 'install', versionId })
    setProgress({ stage: 'version', message: `Preparando ${kind === 'forge' ? 'Forge' : 'OptiFine'} para ${versionId}...`, percent: 0 })
    try {
      if (kind === 'forge') await window.launcher.ensureForge(versionId)
      else await window.launcher.ensureOptifine(versionId)
      pushToast(`${kind === 'forge' ? 'Forge' : 'OptiFine'} instalado para Minecraft ${versionId}`, 'success')
      await loadInstalled()
      setSettings(await window.launcher.getSettings())
      setLibraryRefresh((value) => value + 1)
    } catch (error) {
      const message = errorMessage(error)
      if (/cancel/i.test(message)) pushToast('Instalación cancelada', 'info')
      else pushToast(message, 'error')
    } finally {
      setActivity(null)
      setProgress(null)
    }
  }

  const handleSelectVersion = (id: string): void => {
    if (!id) return
    updateSettings({ selectedVersion: id })
  }

  const handleFabricReady = async (info: FabricProfileInfo): Promise<void> => {
    setSettings(await window.launcher.getSettings())
    await loadInstalled()
    setLibraryRefresh((value) => value + 1)
    pushToast(`Fabric ${info.loaderVersion} preparado para ${info.baseVersion}`, 'success')
  }

  const handleAddOffline = async (name: string): Promise<void> => {
    try {
      const next = await window.launcher.addOfflineAccount(name)
      setAccounts(next)
      pushToast(`Perfil offline "${name}" creado`, 'success')
    } catch (error) {
      pushToast(errorMessage(error), 'error')
      throw error
    }
  }

  const handleRemoveAccount = async (id: string): Promise<void> => {
    try {
      setAccounts(await window.launcher.removeAccount(id))
      pushToast('Cuenta eliminada', 'info')
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }

  const handleSelectAccount = async (id: string): Promise<void> => {
    try {
      setAccounts(await window.launcher.selectAccount(id))
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }

  const handleLoginMicrosoft = async (): Promise<void> => {
    if (loginPending) return
    setLoginPending(true)
    try {
      const next = await window.launcher.loginMicrosoft()
      setAccounts(next)
      pushToast('Cuenta de Microsoft conectada', 'success')
    } catch (error) {
      const message = errorMessage(error)
      if (/cancel/i.test(message)) {
        pushToast('Inicio de sesión cancelado', 'info')
      } else {
        pushToast(message, 'error')
      }
    } finally {
      setLoginPending(false)
    }
  }

  const handleCancelLogin = (): void => {
    void window.launcher.cancelMicrosoftLogin()
  }

  const handleSaveClientId = async (clientId: string): Promise<void> => {
    try {
      setOauth(await window.launcher.setOAuthClientId(clientId))
      pushToast('Client ID guardado', 'success')
    } catch (error) {
      pushToast(errorMessage(error), 'error')
      throw error
    }
  }

  const handleBrowseJava = async (): Promise<void> => {
    try {
      const path = await window.launcher.pickJava()
      if (path) {
        updateSettings({ javaPath: path })
        void loadJava()
      }
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }

  const handleBrowseDir = async (): Promise<void> => {
    try {
      const path = await window.launcher.pickDirectory()
      if (path) updateSettings({ gameDir: path })
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }

  const handleOpenDir = (): void => {
    if (!settings) return
    void window.launcher.openPath(settings.gameDir).catch((error) => {
      pushToast(errorMessage(error), 'error')
    })
  }

  const handleOpenLogs = (): void => {
    void window.launcher.openLogs().catch((error) => {
      pushToast(errorMessage(error), 'error')
    })
  }

  const handleCopyServer = async (): Promise<void> => {
    const address = 'mc.odisseymc.lat'
    try {
      await navigator.clipboard.writeText(address)
    } catch {
      // En Electron con sandbox, clipboard debería estar siempre disponible.
      // Si falla, mostramos un toast de error en lugar de usar la API deprecada.
      pushToast('No se pudo copiar la dirección al portapapeles', 'error')
      return
    }
    pushToast('Dirección del servidor copiada', 'success')
  }

  const handleAddServer = async (): Promise<void> => {
    if (serverAdding) return
    setServerAdding(true)
    try {
      const result = await window.launcher.addServerToMinecraft()
      pushToast(result.message, result.added ? 'success' : 'info')
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    } finally {
      setServerAdding(false)
    }
  }

  const handleJoinOdissey = async (): Promise<void> => {
    if (serverAdding) return
    // Verificar pre-condiciones antes de tocar servers.dat
    if (!settings?.selectedVersion) return
    if (!selectedAccount) {
      setView('accounts')
      pushToast('Añade o selecciona una cuenta para jugar', 'info')
      return
    }
    setServerAdding(true)
    try {
      const result = await window.launcher.addServerToMinecraft()
      pushToast(result.message, result.added ? 'success' : 'info')
      await handleLaunch('38.58.179.118:25609')
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    } finally {
      setServerAdding(false)
    }
  }

  useEffect(() => {
    try {
      window.localStorage.setItem('odyssey:last-view', view)
    } catch {
      // La navegación sigue funcionando aunque no se pueda persistir.
    }
  }, [view])

  useEffect(() => {
    try {
      window.localStorage.setItem('odyssey:sidebar-locked', sidebarLocked ? '1' : '0')
    } catch {
      // La opción sigue disponible durante esta sesión.
    }
  }, [sidebarLocked])

  useEffect(() => {
    const update = (): void => setNetworkOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.key.toLowerCase() === 'tab') {
        event.preventDefault()
        const current = navItems.findIndex((item) => item.view === view)
        const direction = event.shiftKey ? -1 : 1
        const next = (current + direction + navItems.length) % navItems.length
        setView(navItems[next].view)
        return
      }
      const target = event.target instanceof HTMLElement ? event.target : null
      const editing = Boolean(
        target?.isContentEditable ||
        target?.closest('button, a, input, textarea, select, [role="button"], [role="switch"]')
      )
      if (!editing && !event.altKey && !event.ctrlKey && !event.metaKey && /^[1-9]$/.test(event.key)) {
        const item = navItems[Number(event.key) - 1]
        if (item) {
          event.preventDefault()
          setView(item.view)
          return
        }
      }
      if (view !== 'play' || event.altKey || event.metaKey) return
      if (
        target?.isContentEditable ||
        target?.closest('button, a, input, textarea, select, [role="button"], [role="switch"]')
      ) return
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault()
        if (event.ctrlKey) void handleJoinOdissey()
        else void handleLaunch()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [view, handleJoinOdissey, handleLaunch])

  const handleSettingsChange = (next: Settings): void => {
    setSettings(next)
  }

  if (!settings) {
    return (
      <div className="splash">
        <div className="splash-glow" aria-hidden="true" />
        <Logo size={86} />
        <div className="splash-wordmark">
          ODISSEY<span>CLIENT</span>
        </div>
        <div className="splash-loading">
          <span className="spinner" aria-hidden="true" />
          <span>Preparando tu launcher...</span>
        </div>
      </div>
    )
  }

  const installVersionId = activity?.kind === 'install' ? activity.versionId : null

  return (
    <Shell paused={!windowFocused || gameState === 'running'}>
      <aside className={`sidebar ${sidebarLocked ? 'is-compact-locked' : ''}`}>
        <div className="sidebar-panel">
        <div className="brand" title="Odissey Client">
          <Logo size={40} />
          <div className="brand-copy">
            <strong>ODISSEY</strong>
            <span>CLIENT</span>
          </div>
        </div>

        <span className="nav-label">Cliente</span>
        <nav className="nav" aria-label="Navegación principal">
          {navItems.map((item) => (
            <button
              key={item.view}
              className={`nav-item ${view === item.view ? 'active' : ''}`}
              onClick={() => setView(item.view)}
              aria-current={view === item.view ? 'page' : undefined}
              aria-label={item.label}
              title={`${item.label} · ${navItems.indexOf(item) + 1}`}
            >
              <Icon name={item.icon} size={19} />
              <span className="nav-text">{item.label}</span>
              {item.view === 'accounts' && accounts && accounts.accounts.length > 0 ? (
                <span className="nav-count">{accounts.accounts.length}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <button className="sidebar-account" onClick={() => setView('accounts')}>
          <span className={`avatar ${selectedAccount?.type === 'microsoft' ? 'avatar-gold' : ''}`}>
            {selectedAccount ? selectedAccount.name.slice(0, 1).toUpperCase() : '?'}
            {selectedAccount ? <img src={`https://mc-heads.net/avatar/${encodeURIComponent(selectedAccount.uuid)}/64`} alt="" /> : null}
          </span>
          <span className="sidebar-account-copy">
            <strong>{selectedAccount?.name ?? 'Sin cuenta'}</strong>
            <span>
              {selectedAccount
                ? offlineMode
                  ? 'Offline · sesión guardada'
                  : selectedAccount.type === 'microsoft'
                  ? 'Microsoft'
                  : 'Offline'
                : 'Añadir cuenta'}
            </span>
          </span>
          <Icon name="chevron" size={15} />
        </button>

        <div className="sidebar-foot">
          <span className={`status-dot ${offlineMode ? 'is-offline' : gameState === 'running' ? 'is-live' : ''}`} aria-hidden="true" />
          <span className="sidebar-foot-text">
            {offlineMode ? 'Modo sin conexión' : gameState === 'running' ? 'Minecraft en ejecución' : 'Odissey Client 1.0.0'}
          </span>
        </div>
        <button
          className="sidebar-collapse-btn"
          onClick={() => setSidebarLocked((value) => !value)}
          aria-label={sidebarLocked ? 'Permitir expandir la barra lateral' : 'Mantener la barra lateral compacta'}
          aria-pressed={sidebarLocked}
          title={sidebarLocked ? 'Permitir expandir' : 'Fijar compacta'}
        >
          <Icon name="chevron" size={15} />
        </button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="topbar-heading">
            <h1>{meta.title}</h1>
            <p>{meta.subtitle}</p>
          </div>
          <div className="topbar-right">
            <div className={`topbar-status ${offlineMode ? 'is-offline internet-offline' : gameState === 'running' ? 'is-live' : versionsError ? 'is-offline' : ''}`}>
              <span className="online-dot" aria-hidden="true" />
              {offlineMode
                ? 'Modo sin conexión'
                : gameState === 'running'
                ? 'Minecraft en ejecución'
                : gameState === 'preparing'
                  ? 'Sincronizando'
                  : versionsError
                    ? 'Modo local · Sin conexión'
                  : 'ODISSEY listo'}
            </div>
            <button className="topbar-account" onClick={() => setView('accounts')} title="Gestionar cuenta">
              <span className="topbar-avatar">
                {selectedAccount?.name.slice(0, 1).toUpperCase() ?? '?'}
                {selectedAccount ? <img src={`https://mc-heads.net/avatar/${encodeURIComponent(selectedAccount.uuid)}/64`} alt="" /> : null}
              </span>
              <span><strong>{selectedAccount?.name ?? 'Iniciar sesión'}</strong><small>{selectedAccount ? offlineMode ? 'Offline · sesión guardada' : selectedAccount.type === 'microsoft' ? 'Microsoft' : 'Local' : 'Cuenta Minecraft'}</small></span>
              <Icon name="chevron" size={14} />
            </button>
          </div>
        </header>

        <div className="view" key={view}>
          <Suspense
            fallback={
              <div className="view-loading" role="status">
                <span className="spinner" aria-hidden="true" />
                <span>Preparando esta sección...</span>
              </div>
            }
          >
          {view === 'play' ? (
            <PlayView
              settings={settings}
              manifest={manifest}
              installed={installed}
              account={selectedAccount}
              system={system}
              javaList={javaList}
              gameState={gameState}
              progress={progress}
              versionsLoading={versionsLoading}
              versionsError={versionsError}
              server={server}
              community={community}
              communityLoading={communityLoading}
              serverLoading={serverLoading}
              serverAdding={serverAdding}
              onSelectVersion={handleSelectVersion}
              onSelectRam={(ramMb) => updateSettings({ ramMb })}
              onLaunch={() => void handleLaunch()}
              onJoinServer={() => void handleJoinOdissey()}
              onStop={() => void handleStop()}
              onOpenVersions={() => setView('versions')}
              onOpenAccounts={() => setView('accounts')}
              onRetryVersions={() => void loadVersions(true)}
              onRefreshServer={() => void loadServer(true)}
              onAddServer={() => void handleAddServer()}
              onCopyServer={() => void handleCopyServer()}
              onRefreshCommunity={() => void loadCommunity(true)}
              onOpenCommunityLink={(url) => void window.launcher.openExternal(url)}
            />
          ) : null}

          {view === 'versions' ? (
            <VersionsView
              manifest={manifest}
              installed={installed}
              selectedVersion={settings.selectedVersion}
              showSnapshots={settings.showSnapshots}
              loading={versionsLoading}
              error={versionsError}
              installVersionId={installVersionId}
              progress={progress}
              busy={busy}
              onSelect={handleSelectVersion}
              onInstall={(id) => void handleInstall(id)}
              onInstallFabric={(id) => void handleInstallFabricVersion(id)}
              onInstallForge={(id) => void handleInstallExternalLoader(id, 'forge')}
              onInstallOptifine={(id) => void handleInstallExternalLoader(id, 'optifine')}
              onCancelInstall={() => void window.launcher.cancelInstall()}
              onCancelFabric={() => void window.launcher.cancelLibrary()}
              onToggleSnapshots={(value) => updateSettings({ showSnapshots: value })}
              onRefresh={() => void loadVersions(true)}
            />
          ) : null}

          {view === 'accounts' ? (
            <AccountsView
              accounts={accounts}
              oauth={oauth}
              loginPending={loginPending}
              busy={busy}
              onSelect={(id) => void handleSelectAccount(id)}
              onAddOffline={handleAddOffline}
              onLoginMicrosoft={() => void handleLoginMicrosoft()}
              onCancelLogin={handleCancelLogin}
              onRemove={(id) => void handleRemoveAccount(id)}
              onSaveClientId={handleSaveClientId}
            />
          ) : null}

          {view === 'mods' ? (
            <CatalogView
              kind="mod"
              refreshKey={libraryRefresh}
              notify={pushToast}
              onOpenVersions={() => setView('versions')}
              onFabricReady={handleFabricReady}
            />
          ) : null}

          {view === 'textures' ? (
            <CatalogView
              kind="resourcepack"
              refreshKey={libraryRefresh}
              notify={pushToast}
              onOpenVersions={() => setView('versions')}
              onFabricReady={handleFabricReady}
            />
          ) : null}

          {view === 'optimizer' ? (
            <OptimizerView onSettingsChange={handleSettingsChange} notify={pushToast} />
          ) : null}

          {view === 'diagnostics' ? (
            <DiagnosticsView
              selectedVersion={settings.selectedVersion}
              liveLogs={liveLogs}
              onNavigate={setView}
              onReinstall={(versionId) => void handleInstall(versionId)}
              onSettingsChange={handleSettingsChange}
              notify={pushToast}
            />
          ) : null}

          {view === 'screenshots' ? <ScreenshotsView notify={pushToast} /> : null}

          {view === 'settings' ? (
            <SettingsView
              settings={settings}
              system={system}
              javaList={javaList}
              javaLoading={javaLoading}
              logPath={logPath}
              onChange={updateSettings}
              onRefreshJava={() => void loadJava(true)}
              onBrowseJava={() => void handleBrowseJava()}
              onBrowseDir={() => void handleBrowseDir()}
              onOpenDir={handleOpenDir}
              onOpenLogs={handleOpenLogs}
              onOpenDiagnostics={() => setView('diagnostics')}
              onCleanupLogs={() => window.launcher.cleanupOldLogs()}
              notify={pushToast}
            />
          ) : null}
          </Suspense>
        </div>
      </main>

      <ToastHost toasts={toasts} onDismiss={dismissToast} />
      <Modal
        open={crashNotice !== null}
        title="Registro Minecraft"
        onClose={() => setCrashNotice(null)}
        footer={
          <>
            {canRetryWithMoreRam ? (
              <Button variant="secondary" icon="cpu" onClick={() => void retryAfterCrashWithMoreRam()}>
                Reiniciar con +1 GB
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setCrashNotice(null)}>
              Cerrar
            </Button>
            <Button
              variant="primary"
              icon="terminal"
              onClick={() => {
                setCrashNotice(null)
                setView('diagnostics')
              }}
            >
              Ver registro completo
            </Button>
          </>
        }
      >
        {crashNotice ? (
          <div className="crash-notice">
            <p>
              Minecraft se cerró inesperadamente
              {crashNotice.code === null ? '.' : ` (código ${crashNotice.code}).`}
            </p>
            {!crashNotice.report ? (
              <p className="field-hint">Leyendo el último registro del juego...</p>
            ) : crashNotice.report.issues[0] ? (
              <>
                <h3>{crashNotice.report.issues[0].title}</h3>
                <p>{crashNotice.report.issues[0].description}</p>
                {crashNotice.report.issues[0].evidence ? (
                  <pre className="diagnostic-evidence">{crashNotice.report.issues[0].evidence}</pre>
                ) : null}
              </>
            ) : (
              <>
                <p>
                  No se detectó una causa conocida. Puedes revisar el registro reciente del juego.
                </p>
                {crashNotice.report.crashLog ? (
                  <pre className="diagnostic-log-excerpt">
                    {crashNotice.report.crashLog.text.slice(-6000)}
                  </pre>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </Modal>
    </Shell>
  )
}
