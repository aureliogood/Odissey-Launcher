import { useEffect, useMemo, useState, type JSX } from 'react'
import type {
  OptimizerAnalysis,
  OptimizerApplyOptions,
  OptimizerBackupInfo,
  LibraryProgress,
  LibraryTarget,
  Settings,
  AssetScanResult
} from '../../../shared/types'
import { Icon } from './Icons'
import { Badge, Button, Card, Modal, ProgressBar, Spinner } from './UI'

interface OptimizerViewProps {
  onSettingsChange: (settings: Settings) => void
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  }
  return 'Ha ocurrido un error inesperado'
}

function formatMb(value: number): string {
  return value >= 1024 ? `${(value / 1024).toFixed(value % 1024 === 0 ? 0 : 1)} GB` : `${value} MB`
}

function shortPath(path: string): string {
  if (!path) return 'Automático'
  const parts = path.split(/[\\/]/)
  return parts.slice(-2).join('\\')
}

const performanceMods = [
  { id: 'sodium', name: 'Sodium' },
  { id: 'lithium', name: 'Lithium' },
  { id: 'ferrite-core', name: 'FerriteCore' },
  { id: 'immediatelyfast', name: 'ImmediatelyFast' },
  { id: 'modernfix', name: 'ModernFix' },
  { id: 'krypton', name: 'Krypton' }
]

export function OptimizerView({
  onSettingsChange,
  notify
}: OptimizerViewProps): JSX.Element {
  const [analysis, setAnalysis] = useState<OptimizerAnalysis | null>(null)
  const [backup, setBackup] = useState<OptimizerBackupInfo>({ hasBackup: false })
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [boosting, setBoosting] = useState(false)
  const [boostTarget, setBoostTarget] = useState<LibraryTarget | null>(null)
  const [boostProgress, setBoostProgress] = useState<LibraryProgress | null>(null)
  const [assetScan, setAssetScan] = useState<AssetScanResult | null>(null)
  const [scanningAssets, setScanningAssets] = useState(false)
  const [selected, setSelected] = useState<OptimizerApplyOptions>({
    applyRam: false,
    applyJava: false,
    applyJvm: false
  })

  useEffect(() => {
    void window.launcher
      .getOptimizerState()
      .then(setBackup)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    let active = true
    void window.launcher.getLibraryTarget().then(
      (target) => {
        if (active) setBoostTarget(target)
      },
      () => undefined
    )
    const offProgress = window.launcher.onLibraryProgress(setBoostProgress)
    return () => {
      active = false
      offProgress()
    }
  }, [])

  const installPerformancePreset = async (): Promise<void> => {
    if (boosting) return
    setBoosting(true)
    setBoostProgress(null)
    try {
      const target = await window.launcher.getLibraryTarget()
      setBoostTarget(target)
      if (target.loader !== 'fabric' || !target.profileReady) {
        throw new Error('Selecciona o prepara un perfil Fabric antes de instalar el preset.')
      }

      const installed = await window.launcher.listContent('mod')
      const availability = await Promise.all(
        performanceMods.map(async (mod) => {
          try {
            const versions = await window.launcher.getCatalogVersions(mod.id, true)
            const version = versions.find(
              (candidate) =>
                candidate.gameVersions.includes(target.baseVersion) &&
                candidate.loaders.includes('fabric')
            )
            return { ...mod, version }
          } catch {
            return { ...mod, version: undefined }
          }
        })
      )
      const compatible = availability.filter((mod) => mod.version)
      const missing = availability.filter((mod) => !mod.version).map((mod) => mod.name)
      if (compatible.length === 0) {
        throw new Error(`No hay mods del preset compatibles con Minecraft ${target.baseVersion}.`)
      }

      const alreadyInstalled = new Set(
        installed.filter((mod) => !mod.missing).map((mod) => mod.projectId)
      )
      let added = 0
      const skipped: string[] = []
      for (const mod of compatible) {
        if (alreadyInstalled.has(mod.id)) {
          skipped.push(mod.name)
          continue
        }
        await window.launcher.installContent({
          kind: 'mod',
          projectId: mod.id,
          versionId: mod.version!.id
        })
        added += 1
      }

      const details = [
        added ? `${added} instalados` : '',
        skipped.length ? `${skipped.length} ya estaban` : '',
        missing.length ? `${missing.length} no compatibles` : ''
      ].filter(Boolean)
      notify(`Preset de rendimiento listo: ${details.join(', ')}.`, 'success')
      setBoostTarget(await window.launcher.getLibraryTarget())
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setBoosting(false)
      setBoostProgress(null)
    }
  }

  const scanAssets = async (): Promise<void> => {
    if (scanningAssets) return
    setScanningAssets(true)
    try {
      const result = await window.launcher.scanGameAssets()
      setAssetScan(result)
      notify(
        result.invalidArchives.length || result.duplicates.length
          ? `Análisis: ${result.duplicates.length} duplicados y ${result.invalidArchives.length} ZIP dañados`
          : `Análisis completado: ${result.filesScanned} archivos sin problemas detectados`,
        result.invalidArchives.length ? 'error' : 'success'
      )
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setScanningAssets(false)
    }
  }

  const analyze = async (force = true): Promise<void> => {
    setLoading(true)
    try {
      const result = await window.launcher.analyzeOptimizer(force)
      setAnalysis(result)
      setBackup(result.backup)
      setSelected({ applyRam: false, applyJava: false, applyJvm: false })
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setLoading(false)
    }
  }

  const hasSelection =
    selected.applyRam || selected.applyJava || selected.applyJvm

  const apply = async (): Promise<void> => {
    if (!analysis || !hasSelection) return
    setApplying(true)
    setConfirming(false)
    try {
      const result = await window.launcher.applyOptimizer(analysis.patch, selected)
      onSettingsChange(result.settings)
      setBackup({ hasBackup: true, backupAt: result.backupAt, previous: analysis.current })
      notify('Optimización aplicada. Se guardó una copia de la configuración anterior.', 'success')
      const refreshed = await window.launcher.analyzeOptimizer(false)
      setAnalysis(refreshed)
      setSelected({ applyRam: false, applyJava: false, applyJvm: false })
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setApplying(false)
    }
  }

  const restore = async (): Promise<void> => {
    setApplying(true)
    try {
      const settings = await window.launcher.restoreOptimizer()
      onSettingsChange(settings)
      setBackup({ hasBackup: false })
      notify('Configuración anterior restaurada', 'success')
      setAnalysis(null)
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setApplying(false)
    }
  }

  const recommendations = useMemo(
    () => analysis?.recommendations ?? [],
    [analysis]
  )

  return (
    <div className="optimizer-view">
      <section className="optimizer-hero">
        <div className="optimizer-hero-icon">
          <Icon name="sparkles" size={26} />
        </div>
        <div>
          <span className="eyebrow">Análisis local</span>
          <h2>Optimizador inteligente</h2>
          <p>
            Revisa memoria, Java y argumentos JVM según tu hardware real. No se modifica nada hasta
            que lo confirmes y siempre se guarda una copia anterior.
          </p>
        </div>
        <Button
          variant="primary"
          icon="refresh"
          loading={loading}
          onClick={() => void analyze(true)}
        >
          {analysis ? 'Analizar de nuevo' : 'Analizar equipo'}
        </Button>
      </section>

      <Card
        title="Preset de rendimiento Fabric"
        subtitle={`Sodium · Lithium · FerriteCore · ImmediatelyFast · ModernFix · Krypton${boostTarget ? ` · Minecraft ${boostTarget.baseVersion}` : ''}`}
        action={
          <Button
            variant="primary"
            icon="sparkles"
            loading={boosting}
            disabled={!boostTarget || boostTarget.loader !== 'fabric'}
            onClick={() => void installPerformancePreset()}
          >
            {boosting ? 'Instalando...' : 'Instalar preset'}
          </Button>
        }
      >
        <p className="optimizer-note">
          Comprueba compatibilidad con esta versión antes de instalar. Los mods ya instalados se
          conservan y las dependencias obligatorias se resuelven automáticamente.
        </p>
        {boostTarget?.loader !== 'fabric' ? (
          <p className="field-hint">Prepara o selecciona un perfil Fabric para activar el preset.</p>
        ) : null}
        {boostProgress ? (
          <div className="library-progress" role="status">
            <div className="library-progress-head">
              <Spinner />
              <strong>Instalando preset</strong>
              <span>{boostProgress.message}</span>
              <span className="library-progress-percent">{boostProgress.percent}%</span>
            </div>
            <ProgressBar value={boostProgress.percent} />
          </div>
        ) : null}
      </Card>

      <Card
        title="Diagnóstico de paquetes y GPU"
        subtitle="Solo analiza y reporta; no elimina ni modifica archivos"
        action={
          <Button variant="secondary" icon="search" loading={scanningAssets} onClick={() => void scanAssets()}>
            Analizar packs
          </Button>
        }
      >
        <p className="optimizer-note">
          Busca ZIP duplicados o dañados en resourcepacks y shaderpacks. Windows decide qué GPU usa Java;
          puedes abrir su configuración y asignar allí el javaw.exe que usa el launcher.
        </p>
        {window.launcher.platform === 'win32' ? (
          <Button variant="secondary" icon="settings" onClick={() => void window.launcher.openWindowsGpuSettings().catch((error) => notify(errorMessage(error), 'error'))}>
            Abrir configuración de GPU de Windows
          </Button>
        ) : null}
        {assetScan ? (
          <div className="optimizer-note" role="status">
            {assetScan.filesScanned} archivos revisados · {assetScan.duplicates.length} duplicados · {assetScan.invalidArchives.length} ZIP dañados
            {assetScan.invalidArchives.length ? (
              <ul>{assetScan.invalidArchives.slice(0, 5).map((item) => <li key={item.file}>{item.file}: {item.reason}</li>)}</ul>
            ) : null}
            {assetScan.duplicates.length ? (
              <ul>{assetScan.duplicates.slice(0, 5).map((group) => <li key={group.hash}>{group.files.join(' · ')}</li>)}</ul>
            ) : null}
          </div>
        ) : null}
      </Card>

      {loading && !analysis ? (
        <Card>
          <div className="optimizer-loading">
            <Spinner label="Leyendo hardware, Java y metadatos locales..." />
            <p>La primera lectura puede tardar unos segundos. No se abre ni modifica Minecraft.</p>
          </div>
        </Card>
      ) : null}

      {!analysis && !loading ? (
        <Card title="Qué se analiza" subtitle="Sin valores inventados">
          <ul className="optimizer-facts">
            <li>
              <Icon name="cpu" size={17} />
              RAM total y disponible, CPU y GPU detectada.
            </li>
            <li>
              <Icon name="terminal" size={17} />
              Java requerido por la versión local y versiones instaladas detectadas.
            </li>
            <li>
              <Icon name="shield" size={17} />
              Argumentos JVM de riesgo, memoria asignada y copia de seguridad disponible.
            </li>
          </ul>
          <p className="optimizer-note">
            Odissey solo aplica valores conservadores. No se prometen FPS ni se tocan opciones
            gráficas del juego.
          </p>
        </Card>
      ) : null}

      {analysis ? (
        <>
          <div className="optimizer-summary">
            <Card title="Equipo" subtitle="Datos obtenidos del sistema">
              <dl className="optimizer-specs">
                <div>
                  <dt>RAM</dt>
                  <dd>
                    {formatMb(analysis.hardware.totalMemMb)}
                    <small>{formatMb(analysis.hardware.freeMemMb)} disponible ahora</small>
                  </dd>
                </div>
                <div>
                  <dt>CPU</dt>
                  <dd>
                    {analysis.hardware.cpuModel}
                    <small>
                      {analysis.hardware.cpuCount} hilos · {analysis.hardware.arch}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>GPU</dt>
                  <dd>
                    {analysis.hardware.gpu ?? 'No detectada'}
                    <small>
                      {analysis.hardware.gpu?.includes(' · ')
                        ? 'Windows reporta varias GPU; la selección activa depende de Windows.'
                        : analysis.hardware.platform}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>Perfil</dt>
                  <dd>
                    {analysis.baseVersion}
                    <small>{analysis.loader === 'fabric' ? 'Fabric' : 'Vanilla'}</small>
                  </dd>
                </div>
              </dl>
            </Card>

            <Card
              title="Estado"
              subtitle={`Analizado ${new Date(analysis.analyzedAt).toLocaleTimeString('es')}${analysis.cached ? ' · desde caché' : ''}`}
            >
              <ul className="optimizer-status">
                <li>
                  <Badge
                    tone={
                      analysis.java.compatible === false
                        ? 'danger'
                        : analysis.java.compatible === null
                          ? 'neutral'
                          : 'ok'
                    }
                  >
                    {analysis.java.compatible === false
                      ? 'Revisar'
                      : analysis.java.compatible === null
                        ? 'Sin verificar'
                        : 'Compatible'}
                  </Badge>
                  <span>
                    Java{' '}
                    {analysis.java.requiredMajor !== null
                      ? `requerido: ${analysis.java.requiredMajor}+`
                      : 'requerido: no detectado en metadatos'}
                  </span>
                </li>
                <li>
                  <Badge tone={analysis.backup.hasBackup ? 'gold' : 'neutral'}>
                    {analysis.backup.hasBackup ? 'Copia disponible' : 'Sin copia previa'}
                  </Badge>
                  <span>
                    {analysis.backup.hasBackup && analysis.backup.backupAt
                      ? new Date(analysis.backup.backupAt).toLocaleString('es')
                      : 'Se creará al aplicar cambios'}
                  </span>
                </li>
              </ul>
            </Card>
          </div>

          {analysis.warnings.length > 0 ? (
            <div className="optimizer-warnings">
              <Icon name="alert" size={19} />
              <div>
                <strong>Avisos</strong>
                <ul>
                  {analysis.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <Card
            title="Recomendaciones"
            subtitle="Selecciona solo lo que quieras aplicar"
            action={
              <Button
                variant="primary"
                icon="check"
                disabled={!hasSelection}
                loading={applying}
                onClick={() => setConfirming(true)}
              >
                Aplicar seleccionados
              </Button>
            }
          >
            <div className="optimizer-options">
              {recommendations.map((recommendation) => {
                const checked =
                  recommendation.id === 'ram'
                    ? selected.applyRam
                    : recommendation.id === 'java'
                      ? selected.applyJava
                      : recommendation.id === 'jvm'
                        ? selected.applyJvm
                        : false
                const selectable =
                  recommendation.applicable &&
                  (recommendation.id === 'ram' ||
                    recommendation.id === 'java' ||
                    recommendation.id === 'jvm')

                return (
                  <label
                    key={recommendation.id}
                    className={`optimizer-option ${selectable ? '' : 'is-locked'} ${recommendation.tone === 'warn' ? 'is-warn' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!selectable}
                      onChange={(event) => {
                        const value = event.target.checked
                        setSelected((current) => ({
                          ...current,
                          ...(recommendation.id === 'ram' ? { applyRam: value } : {}),
                          ...(recommendation.id === 'java' ? { applyJava: value } : {}),
                          ...(recommendation.id === 'jvm' ? { applyJvm: value } : {})
                        }))
                      }}
                    />
                    <span className="optimizer-option-head">
                      <strong>{recommendation.title}</strong>
                      <span className="optimizer-values">
                        <span>{recommendation.current}</span>
                        <Icon name="chevron" size={13} />
                        <span>{recommendation.recommended}</span>
                      </span>
                    </span>
                    <span className="optimizer-option-detail">{recommendation.detail}</span>
                    {!recommendation.applicable ? (
                      <span className="optimizer-option-state">Sin cambios necesarios</span>
                    ) : null}
                  </label>
                )
              })}
            </div>

            <div className="optimizer-java-list">
              <span>Java detectado</span>
              {analysis.java.detected.length === 0 ? (
                <span className="subtle">No se detectó Java instalado.</span>
              ) : (
                <span className="subtle">
                  {analysis.java.detected
                    .map((java) => `Java ${java.major ?? '?'} · ${shortPath(java.path)}`)
                    .join('   ·   ')}
                </span>
              )}
            </div>
          </Card>

          {backup.hasBackup ? (
            <Card
              title="Copia de seguridad"
              subtitle="Vuelve a la configuración anterior de RAM, Java y argumentos"
            >
              <div className="optimizer-restore">
                <p>
                  {backup.previous
                    ? `Anterior: ${backup.previous.ramMb} MB RAM · ${backup.previous.javaPath ? shortPath(backup.previous.javaPath) : 'Java automático'}`
                    : 'Hay una copia guardada de la última optimización.'}
                </p>
                <Button
                  variant="secondary"
                  icon="refresh"
                  onClick={() => void restore()}
                  disabled={applying}
                >
                  Restaurar configuración anterior
                </Button>
              </div>
            </Card>
          ) : null}
        </>
      ) : null}

      <Modal
        open={confirming}
        title="Confirmar optimización"
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={applying} onClick={() => void apply()}>
              Aplicar cambios
            </Button>
          </>
        }
      >
        {analysis ? (
          <div className="confirm-copy">
            <p>Se guardará una copia de la configuración actual antes de aplicar:</p>
            <ul>
              {selected.applyRam ? (
                <li>
                  RAM: {analysis.current.ramMb} MB → {analysis.patch.ramMb} MB
                </li>
              ) : null}
              {selected.applyJava ? (
                <li>
                  Java: {analysis.current.javaPath ? shortPath(analysis.current.javaPath) : 'Automático'} →{' '}
                  {analysis.patch.javaPath ? shortPath(analysis.patch.javaPath) : 'Automático'}
                </li>
              ) : null}
              {selected.applyJvm ? (
                <li>
                  Argumentos JVM: {analysis.current.extraJvmArgs || 'sin extras'} →{' '}
                  {analysis.patch.extraJvmArgs || 'sin extras'}
                </li>
              ) : null}
            </ul>
            <p className="subtle">
              Los cambios se aplican al próximo inicio del juego. Minecraft no se cierra ni se
              reinicia automáticamente.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
