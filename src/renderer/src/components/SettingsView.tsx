import { useEffect, useState, type JSX } from 'react'
import type { JavaInfo, RestorePoint, Settings, SystemInfo, UpdateInfo } from '../../../shared/types'
import { Icon } from './Icons'
import { Badge, Button, Card, Field, IconButton, Modal, Toggle } from './UI'

interface SettingsViewProps {
  settings: Settings
  system: SystemInfo | null
  javaList: JavaInfo[]
  javaLoading: boolean
  logPath: string
  onChange: (patch: Partial<Settings>) => void
  onRefreshJava: () => void
  onBrowseJava: () => void
  onBrowseDir: () => void
  onOpenDir: () => void
  onOpenLogs: () => void
  onOpenDiagnostics: () => void
  onCleanupLogs: () => Promise<{ deletedFiles: number; deletedBytes: number }>
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  }
  return 'Ha ocurrido un error inesperado'
}

function formatRam(value: number): string {
  const gb = value / 1024
  return Number.isInteger(gb) ? `${gb} GB` : `${value} MB`
}

export function SettingsView({
  settings,
  system,
  javaList,
  javaLoading,
  logPath,
  onChange,
  onRefreshJava,
  onBrowseJava,
  onBrowseDir,
  onOpenDir,
  onOpenLogs,
  onOpenDiagnostics,
  onCleanupLogs,
  notify
}: SettingsViewProps): JSX.Element {
  const [extraArgs, setExtraArgs] = useState(settings.extraJvmArgs)
  const [savedArgs, setSavedArgs] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [downloadingUpdate, setDownloadingUpdate] = useState(false)
  const [installingUpdate, setInstallingUpdate] = useState(false)
  const [confirmInstall, setConfirmInstall] = useState(false)
  const [cleaningLogs, setCleaningLogs] = useState(false)
  const [configBackupBusy, setConfigBackupBusy] = useState(false)
  const [restorePoints, setRestorePoints] = useState<RestorePoint[]>([])
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [includeWorlds, setIncludeWorlds] = useState(false)

  useEffect(() => {
    setExtraArgs(settings.extraJvmArgs)
  }, [settings.extraJvmArgs])

  useEffect(() => {
    void window.launcher.listRestorePoints().then(setRestorePoints).catch(() => undefined)
  }, [])

  useEffect(() => {
    let active = true
    void window.launcher
      .getUpdateInfo()
      .then((info) => {
        if (active) setUpdateInfo(info)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const checkUpdates = async (): Promise<void> => {
    setCheckingUpdate(true)
    try {
      const info = await window.launcher.checkForUpdates()
      setUpdateInfo(info)
      notify(info.message, info.available ? 'info' : 'success')
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setCheckingUpdate(false)
    }
  }

  const downloadLatest = async (): Promise<void> => {
    setDownloadingUpdate(true)
    try {
      const result = await window.launcher.downloadUpdate()
      setUpdateInfo(await window.launcher.getUpdateInfo())
      notify(result.message, result.ready ? 'success' : 'error')
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setDownloadingUpdate(false)
    }
  }

  const installLatest = async (): Promise<void> => {
    setInstallingUpdate(true)
    setConfirmInstall(false)
    try {
      const result = await window.launcher.installUpdate()
      notify(result.message, result.opened ? 'success' : 'error')
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setInstallingUpdate(false)
    }
  }

  const cleanLogs = async (): Promise<void> => {
    if (cleaningLogs) return
    setCleaningLogs(true)
    try {
      const result = await onCleanupLogs()
      const reclaimedMb = (result.deletedBytes / (1024 * 1024)).toFixed(1)
      notify(
        result.deletedFiles
          ? `${result.deletedFiles} archivos antiguos movidos a la papelera (${reclaimedMb} MB).`
          : 'No hay registros antiguos para limpiar.',
        'success'
      )
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setCleaningLogs(false)
    }
  }

  const exportConfig = async (): Promise<void> => {
    setConfigBackupBusy(true)
    try {
      const path = await window.launcher.exportConfigBackup()
      if (path) notify(`Respaldo exportado: ${path}`, 'success')
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setConfigBackupBusy(false)
    }
  }

  const importConfig = async (): Promise<void> => {
    setConfigBackupBusy(true)
    try {
      const imported = await window.launcher.importConfigBackup()
      if (imported) {
        onChange(imported)
        notify('Configuración importada. Se guardó una copia de los archivos reemplazados.', 'success')
      }
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setConfigBackupBusy(false)
    }
  }

  const createRestorePoint = async (): Promise<void> => {
    if (restoreBusy) return
    setRestoreBusy(true)
    try {
      const point = await window.launcher.createRestorePoint(includeWorlds)
      setRestorePoints(await window.launcher.listRestorePoints())
      notify(`Punto de restauración creado (${(point.sizeBytes / (1024 * 1024)).toFixed(1)} MB).`, 'success')
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setRestoreBusy(false)
    }
  }

  const restorePoint = async (point: RestorePoint): Promise<void> => {
    if (restoreBusy || !window.confirm(`Se restaurarán mods, opciones y archivos del punto del ${new Date(point.createdAt).toLocaleString('es')}. Los archivos actuales se reemplazarán. ¿Continuar?`)) return
    setRestoreBusy(true)
    try {
      await window.launcher.restoreRestorePoint(point.id)
      setRestorePoints(await window.launcher.listRestorePoints())
      notify('Punto de restauración aplicado. Se guardó una copia del estado anterior.', 'success')
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setRestoreBusy(false)
    }
  }

  const maxRam = system
    ? Math.min(32768, Math.max(1024, Math.floor(system.totalMemMb * 0.8)))
    : 8192
  const recommended = !system
    ? 4096
    : system.totalMemMb >= 8192
      ? 4096
      : system.totalMemMb >= 6144
        ? 3072
        : system.totalMemMb >= 4096
          ? 2048
          : 1024

  const commitExtraArgs = (): void => {
    const value = extraArgs.trim()
    if (value === settings.extraJvmArgs) return
    onChange({ extraJvmArgs: value })
    setSavedArgs(true)
    window.setTimeout(() => setSavedArgs(false), 1600)
  }

  const javaValue = settings.javaPath
  const knownJava = javaList.some((java) => java.path === settings.javaPath)

  return (
    <div className="settings-view">
      <Card
        title="Rendimiento"
        subtitle="Memoria y entorno de ejecución de Minecraft"
        action={<Icon name="cpu" size={20} />}
      >
        <div className="stack">
          <div className="slider-head">
            <div>
              <span className="field-label">Memoria asignada</span>
              <p className="field-hint">
                {system
                  ? `${Math.round(system.totalMemMb / 1024)} GB detectados · recomendado ${formatRam(recommended)}`
                  : 'Detectando memoria del sistema...'}
              </p>
            </div>
            <span className="ram-value">{formatRam(settings.ramMb)}</span>
          </div>
          <input
            className="range"
            type="range"
            min={1024}
            max={maxRam}
            step={512}
            value={Math.min(settings.ramMb, maxRam)}
            onChange={(event) => onChange({ ramMb: Number(event.target.value) })}
            style={{
              background: `linear-gradient(90deg, rgba(242,201,76,.8) 0%, rgba(242,201,76,.55) ${
                ((Math.min(settings.ramMb, maxRam) - 1024) / (maxRam - 1024)) * 100
              }%, rgba(255,255,255,.09) ${
                ((Math.min(settings.ramMb, maxRam) - 1024) / (maxRam - 1024)) * 100
              }%)`
            }}
            aria-label="Memoria RAM asignada en megabytes"
          />
          <div className="range-scale">
            <span>1 GB</span>
            <span>{Math.round(maxRam / 1024)} GB</span>
          </div>
          <div className="notice notice-info">
            <Icon name="info" size={18} />
            <span>
              Deja memoria libre para Windows y el resto de aplicaciones. Con 6 GB suele ser
              suficiente; sube a 8 GB solo si usas modpacks pesados o shaders.
            </span>
          </div>

          <div className="divider" />

          <div className="row-between wrap">
            <div>
              <span className="field-label">Java</span>
              <p className="field-hint">
                {settings.javaPath
                  ? 'Se usará el ejecutable seleccionado.'
                  : 'Odissey Client detecta automáticamente una versión compatible.'}
              </p>
            </div>
            <Badge tone={javaList.length > 0 ? 'ok' : 'warn'}>
              {javaLoading ? 'Buscando...' : `${javaList.length} detectados`}
            </Badge>
          </div>

          <div className="java-row">
            <div className="select-wrap grow">
              <select
                value={knownJava ? javaValue : javaValue ? '__custom' : ''}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === '__custom') return
                  onChange({ javaPath: value })
                }}
                aria-label="Ejecutable de Java"
              >
                <option value="">Automático (recomendado)</option>
                {javaList.map((java) => (
                  <option key={java.path} value={java.path}>
                    Java {java.major ?? '?'} · {java.path}
                  </option>
                ))}
                {javaValue && !knownJava ? (
                  <option value="__custom">Personalizado · {javaValue}</option>
                ) : null}
              </select>
              <Icon name="chevron" size={16} />
            </div>
            <Button icon="folder" onClick={onBrowseJava}>Elegir</Button>
            <IconButton
              icon="refresh"
              label="Volver a detectar Java"
              onClick={onRefreshJava}
              disabled={javaLoading}
            />
          </div>
          {!javaLoading && javaList.length === 0 ? (
            <p className="field-error">
              No se encontró Java. Instala Java 21 o superior y pulsa actualizar.
            </p>
          ) : null}
        </div>
      </Card>

      <Card
        title="Respaldo de configuración"
        subtitle="Exporta tus preferencias para moverlas a otro equipo"
        action={<Icon name="shield" size={20} />}
      >
        <div className="stack">
          <p className="field-hint">
            El JSON incluye opciones de Minecraft, RAM, resolución y configuraciones detectadas de Sodium/Iris. Se guarda localmente donde elijas; no se sube a la nube ni contiene tokens de cuenta.
          </p>
          <div className="row-actions">
            <Button icon="external" loading={configBackupBusy} onClick={() => void exportConfig()}>
              Exportar JSON
            </Button>
            <Button variant="secondary" icon="download" loading={configBackupBusy} onClick={() => void importConfig()}>
              Importar JSON
            </Button>
          </div>
        </div>
      </Card>

      <Card
        title="Puntos de restauración"
        subtitle="Copias rápidas antes de cambiar mods o reparar una versión"
        action={<Icon name="shield" size={20} />}
      >
        <div className="stack">
          <p className="field-hint">
            Se crean automáticamente antes de instalar o quitar mods, cambiar su estado y reinstalar versiones. Las copias manuales pueden incluir también tus mundos; límite de 1 GB por punto.
          </p>
          <label className="restore-worlds-toggle">
            <input type="checkbox" checked={includeWorlds} onChange={(event) => setIncludeWorlds(event.target.checked)} />
            <span>Incluir mundos en el punto manual</span>
          </label>
          <div className="row-actions">
            <Button icon="plus" loading={restoreBusy} onClick={() => void createRestorePoint()}>
              Crear punto ahora
            </Button>
          </div>
          {restorePoints.length ? (
            <div className="restore-point-list">
              {restorePoints.map((point) => (
                <div className="restore-point-row" key={point.id}>
                  <div>
                    <strong>{new Date(point.createdAt).toLocaleString('es')}</strong>
                    <span>{(point.sizeBytes / (1024 * 1024)).toFixed(1)} MB{point.includesWorlds ? ' · Incluye mundos' : ' · Configuración y mods'}</span>
                  </div>
                  <Button variant="secondary" size="sm" icon="refresh" disabled={restoreBusy} onClick={() => void restorePoint(point)}>
                    Restaurar
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="field-hint">Todavía no hay puntos guardados.</p>
          )}
        </div>
      </Card>

      <Card
        title="Juego"
        subtitle="Carpeta de instalación y ventana"
        action={<Icon name="gamepad" size={20} />}
      >
        <div className="stack">
          <Field
            label="Carpeta del juego"
            htmlFor="game-dir"
            hint="Aquí se guardan versiones, librerías, recursos, mundos y ajustes de Minecraft."
          >
            <div className="path-row">
              <input id="game-dir" className="input mono" value={settings.gameDir} readOnly />
              <Button icon="folder" onClick={onBrowseDir}>Cambiar</Button>
              <IconButton icon="external" label="Abrir carpeta del juego" onClick={onOpenDir} />
            </div>
          </Field>
          <div className="notice notice-ok">
            <Icon name="check" size={17} />
            <span>
              Gráficos, sonido, controles y accesibilidad se comparten entre todas las versiones
              de Minecraft. Los ajustes propios de cada mod permanecen en su perfil.
            </span>
          </div>

          <Toggle
            checked={settings.minimizeToTrayOnGameStart}
            onChange={(value) =>
              onChange({
                minimizeToTrayOnGameStart: value,
                ...(value ? { autoCloseLauncherOnGameStart: false } : {})
              })
            }
            label="Minimizar a la bandeja al iniciar"
            description="Reduce el trabajo visual del launcher y conserva Discord Rich Presence mientras Minecraft está abierto."
          />

          <Toggle
            checked={settings.autoCloseLauncherOnGameStart}
            onChange={(value) =>
              onChange({
                autoCloseLauncherOnGameStart: value,
                ...(value ? { minimizeToTrayOnGameStart: false } : {})
              })
            }
            label="Cerrar el launcher al iniciar Minecraft"
            description="Oculta el launcher mientras juegas y lo vuelve a mostrar al cerrar Minecraft. Discord Rich Presence sigue activo."
          />

          <Toggle
            checked={settings.highPriorityGame}
            onChange={(value) => onChange({ highPriorityGame: value })}
            label="Prioridad alta para Minecraft"
            description="Solicita a Windows más prioridad de CPU para Java. Si no puede aplicarse, el juego continúa con prioridad normal."
          />

          <Toggle
            checked={settings.cleanLogsOnLaunch}
            onChange={(value) => onChange({ cleanLogsOnLaunch: value })}
            label="Limpiar registros antiguos al abrir"
            description="Mueve a la papelera logs rotados e informes de crash de más de 30 días. Conserva latest.log y los registros recientes."
          />
          <div className="row-between wrap">
            <p className="field-hint">La limpieza es local y los archivos pueden restaurarse desde la papelera.</p>
            <Button icon="trash" loading={cleaningLogs} onClick={() => void cleanLogs()}>
              Limpiar ahora
            </Button>
          </div>

          <div className="divider" />

          <Toggle
            checked={settings.customResolution}
            onChange={(value) => onChange({ customResolution: value })}
            label="Resolución personalizada"
            description="Define el tamaño inicial de la ventana de Minecraft."
          />

          <div className={`resolution-row ${settings.customResolution ? '' : 'is-disabled'}`}>
            <Field label="Ancho" htmlFor="res-width">
              <input
                id="res-width"
                className="input"
                type="number"
                min={320}
                max={7680}
                step={10}
                value={settings.resolutionWidth}
                disabled={!settings.customResolution}
                onChange={(event) =>
                  onChange({ resolutionWidth: Number(event.target.value) || 1280 })
                }
              />
            </Field>
            <span className="resolution-x">×</span>
            <Field label="Alto" htmlFor="res-height">
              <input
                id="res-height"
                className="input"
                type="number"
                min={240}
                max={4320}
                step={10}
                value={settings.resolutionHeight}
                disabled={!settings.customResolution}
                onChange={(event) =>
                  onChange({ resolutionHeight: Number(event.target.value) || 720 })
                }
              />
            </Field>
          </div>

          <div className="divider" />

          <Field
            label="Argumentos JVM extra"
            htmlFor="jvm-args"
            hint={
              savedArgs
                ? 'Argumentos guardados.'
                : 'Opcional. No incluyas -Xmx ni -Xms: la memoria se controla arriba.'
            }
          >
            <textarea
              id="jvm-args"
              className="input textarea mono"
              rows={2}
              value={extraArgs}
              onChange={(event) => setExtraArgs(event.target.value)}
              onBlur={commitExtraArgs}
              placeholder="-XX:+UseG1GC"
              spellCheck={false}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Actualizaciones"
        subtitle="Canal firmado para el instalador de Odissey"
        action={<Icon name="download" size={20} />}
      >
        <div className="stack">
          <Toggle
            checked={settings.checkUpdatesOnStart}
            onChange={(value) => onChange({ checkUpdatesOnStart: value })}
            label="Buscar actualizaciones al iniciar"
            description="Solo consulta el canal configurado. Nunca descarga ni instala sin confirmación."
          />

          <div className="divider" />

          <div className="log-box">
            <div>
              <span className="field-label">
                Versión instalada {updateInfo?.currentVersion ?? '1.0.0'}
              </span>
              <p className="field-hint">
                {updateInfo?.latestVersion
                  ? `Última disponible: ${updateInfo.latestVersion}`
                  : updateInfo?.message ?? 'Consultando estado del actualizador...'}
              </p>
            </div>
            <Badge
              tone={
                updateInfo?.installable
                  ? 'ok'
                  : updateInfo?.available && updateInfo.downloaded
                    ? 'danger'
                    : updateInfo?.available
                      ? 'warn'
                      : updateInfo?.configured
                        ? 'neutral'
                        : 'danger'
              }
            >
              {updateInfo?.installable
                ? 'Lista para instalar'
                : updateInfo?.available && updateInfo.downloaded
                  ? 'Descarga sin firma'
                  : updateInfo?.available
                    ? 'Actualización disponible'
                    : updateInfo?.configured
                      ? 'Al día o sin comprobar'
                      : 'Sin canal'}
            </Badge>
          </div>

          {updateInfo?.notes ? <p className="update-notes">{updateInfo.notes}</p> : null}

          {!updateInfo?.configured ? (
            <p className="field-hint">
              El canal no está configurado. La distribución debe definir `ODISSEY_UPDATE_URL` y
              `ODISSEY_UPDATE_PUBKEY`; no se usa ninguna URL por defecto.
            </p>
          ) : null}

          {updateInfo?.configured && !updateInfo.signatureConfigured ? (
            <p className="field-error">
              Falta la clave pública Ed25519. Las descargas no se considerarán auténticas y la
              instalación quedará bloqueada.
            </p>
          ) : null}

          <div className="update-actions">
            <Button
              icon="refresh"
              loading={checkingUpdate}
              onClick={() => void checkUpdates()}
            >
              Buscar actualizaciones
            </Button>
            {updateInfo?.available && !updateInfo.downloaded ? (
              <Button
                variant="secondary"
                icon="download"
                loading={downloadingUpdate}
                onClick={() => void downloadLatest()}
              >
                Descargar
              </Button>
            ) : null}
            {updateInfo?.available && updateInfo.downloaded ? (
              <Button
                variant="primary"
                icon="download"
                loading={installingUpdate}
                disabled={!updateInfo.installable}
                onClick={() => setConfirmInstall(true)}
              >
                Instalar actualización
              </Button>
            ) : null}
          </div>

          <p className="field-hint">
            El instalador solo se abre tras verificar SHA-256 y la firma Ed25519 del manifiesto. Si
            la firma no es válida, la instalación se bloquea.
          </p>
        </div>
      </Card>

      <Card
        title="Registros"
        subtitle="Minecraft y Odissey Client"
        action={<Icon name="terminal" size={20} />}
      >
        <div className="stack">
          <div className="log-box">
            <div>
              <span className="field-label">Registro del launcher</span>
              <p className="field-hint">{logPath || 'Se creará al iniciar el launcher.'}</p>
            </div>
            <Button icon="external" onClick={onOpenLogs} disabled={!logPath}>
              Abrir archivo
            </Button>
          </div>
          <div className="update-actions">
            <Button variant="secondary" icon="terminal" onClick={onOpenDiagnostics}>
              Registro Minecraft
            </Button>
          </div>
          <p className="field-hint">
            Los errores de inicio y las sesiones se registran sin contraseñas ni tokens de acceso.
          </p>
        </div>
      </Card>

      <Modal
        open={confirmInstall}
        title="Instalar actualización"
        onClose={() => setConfirmInstall(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmInstall(false)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={installingUpdate} onClick={() => void installLatest()}>
              Abrir instalador
            </Button>
          </>
        }
      >
        <p className="confirm-text">
          Se abrirá el instalador verificado de Odissey{' '}
          {updateInfo?.latestVersion ? `versión ${updateInfo.latestVersion}` : ''}. Guarda tu trabajo
          y cierra Minecraft antes de continuar. No se elimina tu carpeta de juego ni tus cuentas.
        </p>
      </Modal>
    </div>
  )
}
