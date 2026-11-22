import { useEffect, useMemo, useState, type JSX } from 'react'
import type {
  InstalledVersion,
  LaunchProgress,
  VersionManifest,
  VersionSummary
} from '../../../shared/types'
import { Icon } from './Icons'
import { VersionArtwork } from './VersionArtwork'
import { Badge, Button, Card, EmptyState, IconButton, ProgressBar } from './UI'

interface VersionsViewProps {
  manifest: VersionManifest | null
  installed: InstalledVersion[]
  selectedVersion: string
  showSnapshots: boolean
  loading: boolean
  error: string | null
  installVersionId: string | null
  progress: LaunchProgress | null
  busy: boolean
  onSelect: (id: string) => void
  onInstall: (id: string) => void
  onInstallFabric: (id: string) => void
  onInstallForge: (id: string) => void
  onInstallOptifine: (id: string) => void
  onCancelInstall: () => void
  onCancelFabric: () => void
  onToggleSnapshots: (value: boolean) => void
  onRefresh: () => void
}

type LoaderChoice = 'vanilla' | 'fabric' | 'forge' | 'optifine'

interface VersionFamily {
  id: string
  versions: Array<{ version: VersionSummary; state?: InstalledVersion }>
}

function familyId(version: string): string | null {
  const match = /^(\d+)\.(\d+)(?:\.|$)/.exec(version)
  if (!match) return null
  const major = Number(match[1])
  const minor = Number(match[2])
  if (major < 1 || (major === 1 && minor < 15)) return null
  if (major >= 26) return String(major)
  return `${major}.${minor}`
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' }).format(
      new Date(iso)
    )
  } catch {
    return '—'
  }
}

function typeTone(type: string): 'gold' | 'info' | 'neutral' | 'warn' {
  if (type === 'release') return 'gold'
  if (type === 'snapshot') return 'info'
  if (type === 'old_beta') return 'warn'
  return 'neutral'
}

export function VersionsView({
  manifest,
  installed,
  selectedVersion,
  showSnapshots,
  loading,
  error,
  installVersionId,
  progress,
  busy,
  onSelect,
  onInstall,
  onInstallFabric,
  onInstallForge,
  onInstallOptifine,
  onCancelInstall,
  onCancelFabric,
  onToggleSnapshots,
  onRefresh
}: VersionsViewProps): JSX.Element {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'all' | 'installed'>('all')
  const [expandedFamily, setExpandedFamily] = useState<string | false>(false)
  const [loader, setLoader] = useState<LoaderChoice>('vanilla')

  const installedMap = useMemo(() => {
    return new Map(installed.map((item) => [item.id, item]))
  }, [installed])

  const versions = useMemo(() => {
    const list = [...(manifest?.versions ?? [])]

    for (const item of installed) {
      if (item.kind !== 'fabric') continue
      if (list.some((version) => version.id === item.id)) continue
      list.unshift({
        id: item.id,
        type: 'release',
        url: '',
        time: item.installedAt ?? '',
        releaseTime: item.installedAt ?? ''
      })
    }

    const query = search.trim().toLowerCase()

    return list.filter((version) => {
      const state = installedMap.get(version.id)
      if (tab === 'installed' && !state) return false
      if (!showSnapshots && version.type !== 'release' && version.id !== selectedVersion) return false
      if (query && !version.id.toLowerCase().includes(query)) return false
      if (query && state?.baseVersion && !state.baseVersion.toLowerCase().includes(query)) return false
      return true
    })
  }, [manifest, search, showSnapshots, tab, installedMap, selectedVersion, installed])

  const families = useMemo<VersionFamily[]>(() => {
    const grouped = new Map<string, VersionFamily>()
    for (const version of versions) {
      const state = installedMap.get(version.id)
      const baseVersion = state?.baseVersion ?? version.id
      const family = familyId(baseVersion)
      if (!family) continue
      let group = grouped.get(family)
      if (!group) {
        group = { id: family, versions: [] }
        grouped.set(family, group)
      }
      const candidate = state?.baseVersion && state.id !== baseVersion ? { ...version, id: baseVersion } : version
      const existing = group.versions.findIndex((item) => item.version.id === candidate.id)
      if (existing < 0) group.versions.push({ version: candidate, state })
      else if (!group.versions[existing].state && state) group.versions[existing] = { version: candidate, state }
    }
    const compareIds = (a: string, b: string): number => {
      const av = a.split('.').map(Number)
      const bv = b.split('.').map(Number)
      for (let i = 0; i < Math.max(av.length, bv.length); i++) {
        const diff = (bv[i] ?? 0) - (av[i] ?? 0)
        if (diff) return diff
      }
      return 0
    }
    for (const group of grouped.values()) group.versions.sort((a, b) => compareIds(a.version.id, b.version.id))
    return [...grouped.values()].sort((a, b) => compareIds(a.id, b.id))
  }, [versions, installedMap])

  const selectedInstalled = installedMap.get(selectedVersion)
  const selectedBaseVersion = selectedInstalled?.baseVersion ?? selectedVersion
  const selectedFamily = familyId(selectedBaseVersion)
  const activeFamily = expandedFamily === false
    ? (families.some((family) => family.id === selectedFamily) ? selectedFamily : families[0]?.id ?? null)
    : expandedFamily
  const activeGroup = families.find((family) => family.id === activeFamily)
  const activeEntry = activeGroup?.versions.find((entry) => entry.version.id === selectedBaseVersion) ?? activeGroup?.versions[0]
  const installedCount = installed.filter((item) => item.status === 'installed').length

  useEffect(() => {
    if (selectedInstalled?.kind === 'fabric') setLoader('fabric')
    else if (selectedInstalled?.kind === 'forge') setLoader('forge')
    else if (selectedInstalled?.kind === 'optifine') setLoader('optifine')
    else setLoader('vanilla')
  }, [selectedVersion, selectedInstalled?.kind])

  return (
    <div className="versions-view">
      <Card className="toolbar-card">
        <div className="versions-toolbar">
          <div className="search-box">
            <Icon name="search" size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar versión, por ejemplo 1.21.4"
              aria-label="Buscar versión"
            />
            {search ? (
              <button className="search-clear" onClick={() => setSearch('')} aria-label="Limpiar búsqueda">
                <Icon name="x" size={14} />
              </button>
            ) : null}
          </div>

          <div className="segmented" role="tablist" aria-label="Filtrar versiones">
            <button
              className={tab === 'all' ? 'active' : ''}
              onClick={() => setTab('all')}
              role="tab"
              aria-selected={tab === 'all'}
            >
              Todas
            </button>
            <button
              className={tab === 'installed' ? 'active' : ''}
              onClick={() => setTab('installed')}
              role="tab"
              aria-selected={tab === 'installed'}
            >
              Instaladas <span className="segmented-count">{installedCount}</span>
            </button>
          </div>

          <div className="toolbar-actions">
            <label className="mini-toggle">
              <input
                type="checkbox"
                checked={showSnapshots}
                onChange={(event) => onToggleSnapshots(event.target.checked)}
              />
              <span className="switch switch-sm" aria-hidden="true">
                <span className="switch-thumb" />
              </span>
              Snapshots
            </label>
            <IconButton icon="refresh" label="Actualizar catálogo" onClick={onRefresh} disabled={loading} />
          </div>
        </div>
      </Card>

      {installVersionId ? (
        <Card className="install-banner">
          <div className="install-banner-head">
            <div>
              <strong>Instalando {installVersionId}</strong>
              <span>{progress?.message ?? 'Preparando descarga...'}</span>
            </div>
            <div className="install-banner-actions">
              <span className="install-banner-percent">{Math.round(progress?.percent ?? 0)}%</span>
              <Button size="sm" variant="ghost" onClick={loader === 'fabric' ? onCancelFabric : onCancelInstall}>
                Cancelar
              </Button>
            </div>
          </div>
          <ProgressBar value={progress?.percent} />
        </Card>
      ) : null}

      <Card padded={false} className="versions-card">
        <div className="versions-head">
          <div>
            <h2 className="card-title">Catálogo de versiones</h2>
            <p className="card-subtitle">
              {loading
                ? 'Consultando el catálogo de Mojang...'
                : `${versions.length} versiones · ${installedCount} instaladas`}
            </p>
          </div>
          {manifest?.latest.release ? (
            <Badge tone="gold">Última release: {manifest.latest.release}</Badge>
          ) : null}
        </div>

        {error ? (
          <EmptyState
            icon="alert"
            title="Catálogo sin conexión"
            description="No se pudo consultar Mojang. Tus versiones instaladas siguen disponibles en la pestaña Instaladas; conectar a Internet es necesario para descargar o actualizar versiones."
            action={<Button icon="refresh" onClick={onRefresh}>Reintentar</Button>}
          />
        ) : loading && !manifest ? (
          <div className="version-skeletons" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="version-skeleton" key={index} />
            ))}
          </div>
        ) : families.length === 0 ? (
          <EmptyState
            icon={tab === 'installed' ? 'download' : 'search'}
            title={tab === 'installed' ? 'Todavía no hay versiones instaladas' : 'Sin resultados'}
            description={
              tab === 'installed'
                ? 'Instala una versión desde el catálogo para verla aquí.'
                : 'Prueba con otro término o activa los snapshots.'
            }
            action={
              tab === 'installed' ? (
                <Button onClick={() => setTab('all')} icon="versions">Ver catálogo</Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className="version-list version-family-list">
              {families.map((family) => {
                const isExpanded = family.id === activeFamily
                const latest = family.versions[0]
                const selected = family.id === selectedFamily
                return (
                  <li key={family.id} className={`version-row ${selected ? 'is-selected' : ''}`}>
                    <button
                      className={`version-art ${selected ? 'is-selected' : ''}`}
                      onClick={() => {
                        const latestVersion = family.versions[0]
                        if (latestVersion) {
                          const installedLoader = latestVersion.state?.kind
                          if (installedLoader) setLoader(installedLoader)
                          onSelect(
                            installedLoader && latestVersion.state?.status === 'installed'
                              ? latestVersion.state.id
                              : latestVersion.version.id
                          )
                        }
                        setExpandedFamily(isExpanded ? false : family.id)
                      }}
                      aria-expanded={isExpanded}
                      aria-label={`Mostrar versiones ${family.id}`}
                    >
                      <VersionArtwork version={family.id} />
                      <span className="version-art-brand">MINECRAFT</span>
                      <strong>{family.id}</strong>
                      <span className="version-art-bottom">{family.versions.length} VERSIONES</span>
                      {selected ? <span className="version-art-selected"><Icon name="check" size={13} /> Seleccionada</span> : null}
                    </button>
                    <div className="version-main">
                      <div className="version-name-line"><strong>Minecraft {family.id}</strong></div>
                      <span className="version-date">Más reciente: {latest?.version.id ?? family.id}</span>
                    </div>
                    <div className="version-actions">
                      <Button size="sm" variant={isExpanded ? 'secondary' : 'ghost'} onClick={() => setExpandedFamily(isExpanded ? false : family.id)}>
                        {isExpanded ? 'Ocultar versiones' : 'Ver versiones'}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>

            {activeGroup && activeEntry ? (
              <section className="version-family-detail" aria-label={`Versiones de Minecraft ${activeGroup.id}`}>
                <div className="version-family-detail-head">
                  <div><span className="version-detail-eyebrow">VERSIÓN DE MINECRAFT</span><h3>{activeGroup.id}</h3></div>
                  <label className="version-select-wrap">
                    <span>Subversión</span>
                    <select
                      value={activeEntry.version.id}
                      onChange={(event) => {
                        const next = activeGroup.versions.find((entry) => entry.version.id === event.target.value)
                        if (!next) return
                        onSelect(loader === 'fabric' && next.state?.kind === 'fabric' ? next.state.id : next.version.id)
                      }}
                      aria-label={`Subversión de Minecraft ${activeGroup.id}`}
                    >
                      {activeGroup.versions.map(({ version }) => <option key={version.id} value={version.id}>{version.id}</option>)}
                    </select>
                  </label>
                </div>
                <div className="version-patch-list" aria-label="Subversiones disponibles">
                  {activeGroup.versions.map(({ version, state }) => {
                    const isSelected = version.id === selectedBaseVersion
                    return (
                      <button
                        key={version.id}
                        className={`version-patch ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => onSelect(loader === 'fabric' && state?.kind === 'fabric' ? state.id : version.id)}
                        aria-pressed={isSelected}
                      >
                        <span>{version.id}</span>
                        <small>{state?.status === 'installed' ? 'Instalada' : formatDate(version.releaseTime)}</small>
                      </button>
                    )
                  })}
                </div>
                <div className="version-loader-heading"><span>CARGADOR</span><small>Elige cómo instalar esta versión</small></div>
                <div className="version-loader-options">
                  {([
                    { id: 'vanilla', label: 'Minecraft', sub: 'Sin mods', mark: 'M' },
                    { id: 'fabric', label: 'Fabric', sub: 'Ligero y rápido', mark: 'F' },
                    { id: 'forge', label: 'Forge', sub: 'Instalador oficial', mark: 'FG' },
                    { id: 'optifine', label: 'OptiFine', sub: 'Instalador oficial', mark: 'OF' }
                  ] as const).map((choice) => (
                    <button
                      key={choice.id}
                      className={`version-loader-choice ${loader === choice.id ? 'is-selected' : ''}`}
                      onClick={() => {
                        setLoader(choice.id)
                        onSelect(choice.id === 'vanilla'
                          ? activeEntry.version.id
                          : choice.id === 'fabric' && activeEntry.state?.kind === 'fabric'
                            ? activeEntry.state.id
                            : activeEntry.version.id)
                      }}
                      aria-pressed={loader === choice.id}
                    >
                      <span className={`version-loader-mark loader-${choice.id}`}>{choice.mark}</span>
                      <span className="version-loader-copy"><strong>{choice.label}</strong><small>{choice.sub}</small></span>
                      {loader === choice.id ? <Icon name="check" size={14} /> : null}
                    </button>
                  ))}
                </div>
                <div className="version-detail-footer">
                  <span>{loader === 'fabric' ? 'Perfil Fabric independiente' : loader === 'forge' ? 'Cliente Forge oficial' : loader === 'optifine' ? 'Instalador oficial; requiere elegir esta carpeta de juego' : 'Versión oficial de Minecraft'}</span>
                  <Button
                    size="sm"
                    icon={loader === 'fabric' ? 'sparkles' : 'download'}
                    loading={Boolean(installVersionId)}
                    disabled={busy || Boolean(installVersionId)}
                    onClick={() => {
                      if (loader === 'fabric') onInstallFabric(activeEntry.version.id)
                      else if (loader === 'forge') onInstallForge(activeEntry.version.id)
                      else if (loader === 'optifine') onInstallOptifine(activeEntry.version.id)
                      else onInstall(activeEntry.version.id)
                    }}
                  >
                    {loader === 'fabric' ? 'Instalar Fabric' : loader === 'forge' ? 'Instalar Forge' : loader === 'optifine' ? 'Instalar OptiFine' : 'Instalar versión'}
                  </Button>
                </div>
              </section>
            ) : null}
          </>
        )}
      </Card>
    </div>
  )
}
