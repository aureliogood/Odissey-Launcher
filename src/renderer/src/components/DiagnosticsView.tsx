import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type {
  DiagnosticAction,
  DiagnosticIssue,
  DiagnosticReport,
  Settings
} from '../../../shared/types'
import { Icon } from './Icons'
import { Badge, Button, Card, Modal, Spinner } from './UI'

type NavigableView = 'settings' | 'versions' | 'mods' | 'accounts'

interface DiagnosticsViewProps {
  selectedVersion: string
  liveLogs: string[]
  onNavigate: (view: NavigableView) => void
  onReinstall: (versionId: string) => void
  onSettingsChange: (settings: Settings) => void
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  }
  return 'Ha ocurrido un error inesperado'
}

const severityTone: Record<DiagnosticIssue['severity'], 'danger' | 'warn' | 'info'> = {
  critical: 'danger',
  warning: 'warn',
  info: 'info'
}

const severityLabel: Record<DiagnosticIssue['severity'], string> = {
  critical: 'Crítico',
  warning: 'Advertencia',
  info: 'Información'
}

function confidenceLabel(value: number): string {
  if (value >= 0.9) return 'Confianza alta'
  if (value >= 0.75) return 'Confianza media'
  return 'Confianza baja'
}

interface PendingAction {
  title: string
  message: string
  run: () => Promise<void>
}

export function DiagnosticsView({
  selectedVersion,
  liveLogs,
  onNavigate,
  onReinstall,
  onSettingsChange,
  notify
}: DiagnosticsViewProps): JSX.Element {
  const [report, setReport] = useState<DiagnosticReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const liveLogRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (liveLogRef.current) liveLogRef.current.scrollTop = liveLogRef.current.scrollHeight
  }, [liveLogs])

  const scan = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await window.launcher.runDiagnostics()
      setReport(result)
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => {
    void scan()
  }, [scan])

  const save = async (): Promise<void> => {
    if (!report) return
    setSaving(true)
    try {
      const path = await window.launcher.saveDiagnosticReport(report)
      if (path) notify('Informe guardado localmente', 'success')
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const runPending = async (): Promise<void> => {
    if (!pending) return
    setActionBusy(true)
    try {
      await pending.run()
      setPending(null)
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setActionBusy(false)
    }
  }

  const handleAction = (action: DiagnosticAction, issue: DiagnosticIssue): void => {
    switch (action.kind) {
      case 'open-file':
        if (action.target) {
          void window.launcher.openPath(action.target).catch((error) => {
            notify(errorMessage(error), 'error')
          })
        }
        break
      case 'open-logs':
        void (action.target
          ? window.launcher.openPath(action.target)
          : window.launcher.openLogs()
        ).catch((error) => {
          notify(errorMessage(error), 'error')
        })
        break
      case 'open-settings':
      case 'open-versions':
      case 'open-mods':
      case 'open-accounts':
        onNavigate(action.kind.replace('open-', '') as NavigableView)
        break
      case 'reinstall-version':
        if (!selectedVersion) {
          notify('Selecciona una versión antes de reinstalar', 'info')
          break
        }
        setPending({
          title: 'Reinstalar versión',
          message:
            `Se comprobarán y recuperarán solo los archivos que falten de ${selectedVersion}. ` +
            'No se eliminarán tus mundos, mods ni ajustes. Cierra Minecraft antes de continuar.',
          run: async () => {
            onReinstall(selectedVersion)
          }
        })
        break
      case 'restore-settings':
        setPending({
          title: 'Restaurar ajustes',
          message:
            'Se restaurará la última copia válida de settings.json. La configuración actual se guardará como .before-restore. ' +
            'No se elimina ninguna cuenta, mundo o contenido.',
          run: async () => {
            const settings = await window.launcher.restoreSettingsBackup()
            onSettingsChange(settings)
            notify('Ajustes restaurados desde la copia de seguridad', 'success')
          }
        })
        break
      default:
        break
    }
    if (action.kind === 'open-file' && !action.target) {
      notify(`No hay archivo asociado a ${issue.title}`, 'info')
    }
  }

  return (
    <div className="diagnostics-view">
      <section className="diagnostics-hero">
        <div className="diagnostics-hero-icon">
          <Icon name="terminal" size={26} />
        </div>
        <div>
          <span className="eyebrow">Registros locales</span>
          <h2>Registro Minecraft</h2>
          <p>
            Aquí aparecen el registro reciente del juego, los informes de cierre y las causas
            reconocidas. Los archivos se quedan en tu equipo.
          </p>
        </div>
        <div className="diagnostics-hero-actions">
          <Button variant="secondary" icon="refresh" loading={loading} onClick={() => void scan()}>
            Actualizar registro
          </Button>
          <Button
            variant="primary"
            icon="download"
            loading={saving}
            disabled={!report}
            onClick={() => void save()}
          >
            Guardar informe
          </Button>
        </div>
      </section>

      <Card
        title="Consola de Minecraft en vivo"
        subtitle="Salida estándar de la JVM durante esta sesión"
        action={<Badge tone={liveLogs.length ? 'ok' : 'info'}>{liveLogs.length} líneas</Badge>}
      >
        {liveLogs.length ? (
          <pre className="live-log-console" ref={liveLogRef} aria-live="polite">
            {liveLogs.map((line, index) => {
              const tone = /\b(ERROR|FATAL|Exception|Caused by:|crash)\b/i.test(line)
                ? 'is-error'
                : /\b(WARN|WARNING)\b/i.test(line)
                  ? 'is-warning'
                  : ''
              return <span key={`${index}-${line.slice(0, 28)}`} className={tone}>{line}{'\n'}</span>
            })}
          </pre>
        ) : (
          <p className="field-hint">Los mensajes aparecerán aquí cuando inicies Minecraft. Se conservan las últimas 800 líneas mientras el launcher está abierto.</p>
        )}
      </Card>

      {loading && !report ? (
        <Card>
          <div className="diagnostics-loading">
            <Spinner label="Leyendo registros locales..." />
            <p>Solo se leen las últimas 512 KB de cada archivo para no bloquear la interfaz.</p>
          </div>
        </Card>
      ) : null}

      {report ? (
        <>
          <div className="diagnostics-summary">
            <div className="diagnostics-count is-critical">
              <strong>{report.summary.critical}</strong>
              <span>Críticos</span>
            </div>
            <div className="diagnostics-count is-warning">
              <strong>{report.summary.warning}</strong>
              <span>Advertencias</span>
            </div>
            <div className="diagnostics-count is-info">
              <strong>{report.summary.info}</strong>
              <span>Información</span>
            </div>
            <div className="diagnostics-meta">
              <span>
                {new Date(report.generatedAt).toLocaleString('es')} · {report.files.length}{' '}
                archivo{report.files.length === 1 ? '' : 's'} revisado
                {report.files.length === 1 ? '' : 's'}
              </span>
              {report.truncated ? <Badge tone="warn">Lectura parcial</Badge> : null}
            </div>
          </div>

          {report.issues.length === 0 ? (
            <Card>
              <div className="diagnostics-empty">
                <div className="empty-icon">
                  <Icon name="shield" size={26} />
                </div>
                <h3>No se detectaron errores reconocibles</h3>
                <p>
                  {report.files.length === 0
                    ? 'Todavía no hay registros de Minecraft en esta instalación. Inicia el juego una vez y vuelve a escanear.'
                    : 'El último registro está disponible abajo, aunque el launcher no pudo identificar automáticamente la causa.'}
                </p>
              </div>
            </Card>
          ) : (
            <div className="diagnostics-list">
              {report.issues.map((issue) => (
                <article key={issue.id} className={`diagnostic-issue is-${issue.severity}`}>
                  <header className="diagnostic-head">
                    <div>
                      <span className="diagnostic-badges">
                        <Badge tone={severityTone[issue.severity]}>
                          {severityLabel[issue.severity]}
                        </Badge>
                        <Badge tone="neutral">{confidenceLabel(issue.confidence)}</Badge>
                      </span>
                      <h3>{issue.title}</h3>
                    </div>
                    <span className="diagnostic-rule">{issue.rule}</span>
                  </header>

                  <p className="diagnostic-description">{issue.description}</p>

                  <dl className="diagnostic-details">
                    <div>
                      <dt>Causa probable</dt>
                      <dd>{issue.cause}</dd>
                    </div>
                    <div>
                      <dt>Solución recomendada</dt>
                      <dd>{issue.solution}</dd>
                    </div>
                  </dl>

                  {issue.evidence ? (
                    <pre className="diagnostic-evidence">{issue.evidence}</pre>
                  ) : null}

                  <div className="diagnostic-actions">
                    {issue.actions.map((action, index) => (
                      <Button
                        key={`${action.kind}-${index}`}
                        size="sm"
                        variant={action.dangerous ? 'secondary' : 'ghost'}
                        icon={
                          action.kind === 'open-file'
                            ? 'folder'
                            : action.kind === 'open-logs'
                              ? 'terminal'
                              : action.kind === 'reinstall-version'
                                ? 'download'
                                : action.kind === 'restore-settings'
                                  ? 'refresh'
                                  : 'chevron'
                        }
                        onClick={() => handleAction(action, issue)}
                      >
                        {action.label}
                      </Button>
                    ))}
                    {issue.file ? (
                      <span className="diagnostic-file" title={issue.file}>
                        {issue.file.split(/[\\/]/).slice(-2).join('\\')}
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}

          {report.crashLog ? (
            <Card
              title={report.crashLog.label}
              subtitle={report.crashLog.path}
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  icon="external"
                  onClick={() =>
                    void window.launcher.openPath(report.crashLog!.path).catch((error) => {
                      notify(errorMessage(error), 'error')
                    })
                  }
                >
                  Abrir archivo
                </Button>
              }
            >
              <pre className="diagnostic-log-excerpt">{report.crashLog.text}</pre>
            </Card>
          ) : null}

          {report.files.length > 0 ? (
            <Card title="Archivos revisados" subtitle="Las rutas no salen de tu equipo">
              <ul className="diagnostic-files">
                {report.files.map((file) => (
                  <li key={file}>
                    <Icon name="folder" size={15} />
                    <button
                      className="link-btn"
                      onClick={() =>
                        void window.launcher.openPath(file).catch((error) => {
                          notify(errorMessage(error), 'error')
                        })
                      }
                    >
                      {file}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}

      <Modal
        open={pending !== null}
        title={pending?.title ?? ''}
        onClose={() => setPending(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={actionBusy} onClick={() => void runPending()}>
              Confirmar
            </Button>
          </>
        }
      >
        <p className="confirm-text">{pending?.message}</p>
      </Modal>
    </div>
  )
}
