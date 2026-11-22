import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX
} from 'react'
import type {
  CatalogCategory,
  CatalogDependency,
  CatalogProject,
  CatalogProjectDetail,
  CatalogSort,
  CatalogVersion,
  ContentKind,
  FabricProfileInfo,
  InstalledContent,
  LibraryProgress,
  LibraryTarget
} from '../../../shared/types'
import { Icon } from './Icons'
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Modal,
  ProgressBar,
  type ToastTone
} from './UI'

interface CatalogViewProps {
  kind: ContentKind
  refreshKey: number
  notify: (message: string, tone?: ToastTone) => void
  onOpenVersions: () => void
  onFabricReady: (info: FabricProfileInfo) => Promise<void> | void
}

type Tab = 'browse' | 'installed'
type Operation = 'install' | 'fabric' | null

const PAGE_SIZE = 24

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  }
  return 'Ha ocurrido un error inesperado'
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)
}

function formatBytes(value?: number): string {
  if (!value) return ''
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}

function plainText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function categoryLabel(value: string): string {
  return value.replace(/-/g, ' ')
}

function colorStyle(color?: number | null): { background?: string } {
  if (typeof color !== 'number' || !Number.isFinite(color)) return {}
  const hex = Math.max(0, Math.min(0xffffff, Math.floor(color)))
    .toString(16)
    .padStart(6, '0')
  return { background: `#${hex}22` }
}

function ProjectIcon({
  project,
  size = 48
}: {
  project: Pick<CatalogProject, 'title' | 'iconUrl' | 'color'>
  size?: number
}): JSX.Element {
  const [failed, setFailed] = useState(false)
  return (
    <span
      className="project-icon"
      style={{ ...colorStyle(project.color), width: size, height: size }}
      aria-hidden="true"
    >
      <span>{project.title.slice(0, 1).toUpperCase()}</span>
      {project.iconUrl && !failed ? (
        <img
          src={project.iconUrl}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  )
}

function ProjectCard({
  project,
  installed,
  onOpen
}: {
  project: CatalogProject
  installed: boolean
  onOpen: () => void
}): JSX.Element {
  return (
    <div
      className="project-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      aria-label={`Ver ${project.title}`}
    >
      <div className="project-card-top">
        <ProjectIcon project={project} />
        <div className="project-card-heading">
          <strong>{project.title}</strong>
          <span>{project.author || 'Autor de Modrinth'}</span>
        </div>
        {installed ? (
          <span className="installed-mark" title="Instalado">
            <Icon name="check" size={14} />
          </span>
        ) : null}
      </div>

      <p className="project-description">{project.description}</p>

      <div className="project-tags">
        {project.loaders.includes('fabric') ? <Badge tone="ok">Fabric</Badge> : null}
        {project.categories.slice(0, 2).map((category) => (
          <span className="tag" key={category}>
            {categoryLabel(category)}
          </span>
        ))}
      </div>

      <div className="project-meta">
        <span>
          <Icon name="download" size={13} />
          {formatNumber(project.downloads)}
        </span>
        <span>
          <Icon name="users" size={13} />
          {formatNumber(project.followers)}
        </span>
        <span className="project-open">Ver detalles</span>
      </div>
    </div>
  )
}

export function CatalogView({
  kind,
  refreshKey,
  notify,
  onOpenVersions,
  onFabricReady
}: CatalogViewProps): JSX.Element {
  const [target, setTarget] = useState<LibraryTarget | null>(null)
  const [targetError, setTargetError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('browse')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<CatalogSort>('downloads')
  const [category, setCategory] = useState('')
  const [categories, setCategories] = useState<CatalogCategory[]>([])
  const [projects, setProjects] = useState<CatalogProject[]>([])
  const [total, setTotal] = useState(0)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [installed, setInstalled] = useState<InstalledContent[]>([])
  const [installedError, setInstalledError] = useState<string | null>(null)
  const [detail, setDetail] = useState<CatalogProjectDetail | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [versions, setVersions] = useState<CatalogVersion[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [dependencies, setDependencies] = useState<CatalogDependency[]>([])
  const [operation, setOperation] = useState<Operation>(null)
  const [progress, setProgress] = useState<LibraryProgress | null>(null)
  const [pendingRemove, setPendingRemove] = useState<InstalledContent | null>(null)
  const [togglingMod, setTogglingMod] = useState<string | null>(null)

  const searchSeq = useRef(0)
  const detailSeq = useRef(0)
  const operationRef = useRef<Operation>(null)

  const isTexture = kind === 'resourcepack'
  const installedIds = useMemo(
    () => new Set(installed.map((item) => item.projectId)),
    [installed]
  )

  const setActiveOperation = useCallback((next: Operation) => {
    operationRef.current = next
    setOperation(next)
  }, [])

  const loadTarget = useCallback(async (): Promise<LibraryTarget | null> => {
    try {
      const next = await window.launcher.getLibraryTarget()
      setTarget(next)
      setTargetError(null)
      return next
    } catch (error) {
      setTargetError(errorMessage(error))
      return null
    }
  }, [])

  const loadInstalled = useCallback(async (): Promise<void> => {
    try {
      setInstalled(await window.launcher.listContent(kind))
      setInstalledError(null)
    } catch (error) {
      setInstalledError(errorMessage(error))
    }
  }, [kind])

  useEffect(() => {
    void loadTarget()
  }, [loadTarget, refreshKey])

  useEffect(() => {
    if (!target) return
    void loadInstalled()
  }, [loadInstalled, refreshKey, target])

  useEffect(() => {
    void window.launcher
      .getCatalogCategories(kind)
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [kind])

  useEffect(() => {
    return window.launcher.onLibraryProgress((next) => {
      if (operationRef.current) setProgress(next)
    })
  }, [])

  const runSearch = useCallback(
    async (offset: number, append: boolean, force = false): Promise<void> => {
      if (!target) return
      const sequence = ++searchSeq.current
      setSearching(true)
      setSearchError(null)

      try {
        const result = await window.launcher.searchCatalog({
          kind,
          query: query.trim(),
          gameVersion: target.baseVersion,
          category: category || undefined,
          sort,
          offset,
          limit: PAGE_SIZE,
          force
        })
        if (sequence !== searchSeq.current) return
        setProjects((current) =>
          append ? [...current, ...result.projects] : result.projects
        )
        setTotal(result.total)
      } catch (error) {
        if (sequence !== searchSeq.current) return
        setSearchError(errorMessage(error))
        if (!append) {
          setProjects([])
          setTotal(0)
        }
      } finally {
        if (sequence === searchSeq.current) setSearching(false)
      }
    },
    [category, kind, query, sort, target]
  )

  useEffect(() => {
    if (!target) return
    const timer = window.setTimeout(() => void runSearch(0, false), query ? 340 : 0)
    return () => window.clearTimeout(timer)
  }, [runSearch, query, target])

  useEffect(() => {
    if (!selectedVersionId) {
      setDependencies([])
      return
    }
    let active = true
    void window.launcher
      .getCatalogDependencies(selectedVersionId)
      .then((next) => {
        if (active) setDependencies(next)
      })
      .catch(() => {
        if (active) setDependencies([])
      })
    return () => {
      active = false
    }
  }, [selectedVersionId])

  const openProject = async (project: CatalogProject): Promise<void> => {
    if (!target) return
    const sequence = ++detailSeq.current
    setDetailId(project.id)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    setVersions([])
    setSelectedVersionId('')
    setDependencies([])

    try {
      const [info, list] = await Promise.all([
        window.launcher.getCatalogProject(project.id),
        window.launcher.getCatalogVersions(project.id)
      ])
      if (sequence !== detailSeq.current) return
      const loader = kind === 'mod' ? 'fabric' : 'minecraft'
      const compatible = list.filter(
        (version) =>
          version.gameVersions.includes(target.baseVersion) &&
          version.loaders.includes(loader)
      )
      setDetail(info)
      setVersions(compatible)
      setSelectedVersionId(compatible[0]?.id ?? '')
    } catch (error) {
      if (sequence === detailSeq.current) setDetailError(errorMessage(error))
    } finally {
      if (sequence === detailSeq.current) setDetailLoading(false)
    }
  }

  const closeDetail = (): void => {
    if (operation) return
    detailSeq.current += 1
    setDetailId(null)
    setDetail(null)
    setDetailError(null)
    setVersions([])
    setSelectedVersionId('')
    setDependencies([])
  }

  const handleInstall = async (): Promise<void> => {
    if (!detail || !selectedVersionId || !target) return
    if (kind === 'mod' && !target.profileReady) {
      notify('Prepara Fabric antes de instalar mods', 'info')
      return
    }

    setActiveOperation('install')
    setProgress({ message: 'Resolviendo dependencias...', percent: 0 })

    try {
      const next = await window.launcher.installContent({
        kind,
        projectId: detail.project.id,
        versionId: selectedVersionId
      })
      setInstalled(next)
      notify(
        isTexture
          ? `${detail.project.title} instalado. Actívalo en Opciones > Paquetes de recursos.`
          : `${detail.project.title} instalado con sus dependencias`,
        'success'
      )
    } catch (error) {
      const message = errorMessage(error)
      notify(/cancel/i.test(message) ? 'Instalación cancelada' : message, /cancel/i.test(message) ? 'info' : 'error')
    } finally {
      setActiveOperation(null)
      setProgress(null)
    }
  }

  const handlePrepareFabric = async (): Promise<void> => {
    if (!target) return
    setActiveOperation('fabric')
    setProgress({ message: `Preparando Fabric para ${target.baseVersion}...`, percent: 0 })

    try {
      const info = await window.launcher.ensureFabric(target.baseVersion)
      await onFabricReady(info)
      await loadTarget()
      await loadInstalled()
      notify(`Fabric ${info.loaderVersion} listo. Los mods ya se pueden instalar.`, 'success')
    } catch (error) {
      const message = errorMessage(error)
      notify(
        /cancel/i.test(message) ? 'Preparación de Fabric cancelada' : message,
        /cancel/i.test(message) ? 'info' : 'error'
      )
    } finally {
      setActiveOperation(null)
      setProgress(null)
    }
  }

  const handleRemove = async (): Promise<void> => {
    if (!pendingRemove) return
    try {
      const next = await window.launcher.removeContent({
        kind,
        projectId: pendingRemove.projectId
      })
      setInstalled(next)
      notify(`${pendingRemove.title} eliminado del perfil`, 'info')
      setPendingRemove(null)
    } catch (error) {
      notify(errorMessage(error), 'error')
    }
  }

  const handleToggleMod = async (item: InstalledContent): Promise<void> => {
    if (item.missing || togglingMod) return
    setTogglingMod(item.projectId)
    try {
      setInstalled(await window.launcher.setModEnabled(item.projectId, item.enabled === false))
      notify(`${item.title} ${item.enabled === false ? 'activado' : 'desactivado'}`, 'success')
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setTogglingMod(null)
    }
  }

  const handleOpenFolder = (): void => {
    void window.launcher.openContentFolder(kind).catch((error) => {
      notify(errorMessage(error), 'error')
    })
  }

  const selectedVersion = versions.find((version) => version.id === selectedVersionId)
  const needsFabric = kind === 'mod' && (!target || !target.profileReady)
  const currentInstalled = detail ? installed.find((item) => item.projectId === detail.project.id) : null
  const canInstall =
    Boolean(selectedVersion) && (kind !== 'mod' || target?.profileReady === true)

  return (
    <div className="library-view">
      <div className="library-head">
        <div className="library-tabs" role="tablist" aria-label="Biblioteca">
          <button
            className={tab === 'browse' ? 'active' : ''}
            onClick={() => setTab('browse')}
            role="tab"
            aria-selected={tab === 'browse'}
          >
            Explorar
          </button>
          <button
            className={tab === 'installed' ? 'active' : ''}
            onClick={() => setTab('installed')}
            role="tab"
            aria-selected={tab === 'installed'}
          >
            Instalados
            <span className="tab-count">{installed.length}</span>
          </button>
        </div>

        <div className="library-context">
          {target ? (
            <>
              <span className="context-chip">
                <span className="context-dot" aria-hidden="true" />
                Minecraft {target.baseVersion}
              </span>
              <span className={`context-chip ${target.loader === 'fabric' ? 'is-gold' : ''}`}>
                {target.loader === 'fabric'
                  ? `Fabric ${target.loaderVersion ?? ''}`.trim()
                  : 'Vanilla'}
              </span>
              <span className="context-chip subtle">
                {target.isolated ? 'Perfil aislado' : 'Carpeta compartida'}
              </span>
            </>
          ) : (
            <span className="context-chip subtle">Cargando perfil...</span>
          )}
          <IconButton
            icon="folder"
            label={isTexture ? 'Abrir carpeta de paquetes' : 'Abrir carpeta de mods'}
            onClick={handleOpenFolder}
            disabled={!target}
          />
          <Button size="sm" variant="ghost" icon="versions" onClick={onOpenVersions}>
            Versiones
          </Button>
        </div>
      </div>

      {targetError ? (
        <div className="library-notice is-error">
          <Icon name="alert" size={18} />
          <span>{targetError}</span>
          <Button size="sm" variant="ghost" onClick={() => void loadTarget()}>
            Reintentar
          </Button>
        </div>
      ) : null}

      {needsFabric ? (
        <div className="library-notice">
          <span className="notice-icon">
            <Icon name="puzzle" size={18} />
          </span>
          <div>
            <strong>Este perfil todavía no admite mods</strong>
            <p>
              Instala Fabric {target?.baseVersion ? `para ${target.baseVersion}` : ''} para
              aislar la instancia y cargar mods compatibles.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon="sparkles"
            loading={operation === 'fabric'}
            disabled={Boolean(operation) || !target}
            onClick={() => void handlePrepareFabric()}
          >
            Instalar Fabric
          </Button>
        </div>
      ) : null}

      {operation ? (
        <div className="library-progress" role="status">
          <div className="library-progress-head">
            <span className="spinner spinner-sm" aria-hidden="true" />
            <strong>
              {operation === 'fabric' ? 'Preparando Fabric' : 'Instalando contenido'}
            </strong>
            <span>{progress?.message ?? 'Trabajando...'}</span>
            <span className="library-progress-percent">{progress?.percent ?? 0}%</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void window.launcher.cancelLibrary()}
            >
              Cancelar
            </Button>
          </div>
          <ProgressBar value={progress?.percent ?? 0} />
        </div>
      ) : null}

      {tab === 'browse' ? (
        <>
          {!isTexture ? (
            <div className="quick-categories" aria-label="Categorías rápidas">
              {[
                { label: 'Todos', value: '' },
                { label: 'Optimización', value: 'optimization' },
                { label: 'Visuales', value: 'decoration' },
                { label: 'HUD / Utility', value: 'utility' }
              ].map((entry) => (
                <button
                  key={entry.label}
                  type="button"
                  className={category === entry.value ? 'active' : ''}
                  aria-pressed={category === entry.value}
                  onClick={() => setCategory(entry.value)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="catalog-controls">
            <div className="search-field">
              <Icon name="search" size={17} />
              <input
                className="input"
                value={query}
                maxLength={100}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={isTexture ? 'Buscar paquetes de textura...' : 'Buscar mods para Minecraft...'}
                aria-label={isTexture ? 'Buscar paquetes de textura' : 'Buscar mods'}
                spellCheck={false}
              />
              {query ? (
                <IconButton icon="x" label="Limpiar búsqueda" onClick={() => setQuery('')} />
              ) : null}
            </div>

            <select
              className="select"
              value={sort}
              onChange={(event) => setSort(event.target.value as CatalogSort)}
              aria-label="Ordenar resultados"
            >
              <option value="downloads">Más descargados</option>
              <option value="relevance">Relevancia</option>
              <option value="follows">Más seguidos</option>
              <option value="newest">Más recientes</option>
              <option value="updated">Actualizados</option>
            </select>

            <select
              className="select"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-label="Filtrar por categoría"
            >
              <option value="">Todas las categorías</option>
              {categories.map((entry) => (
                <option key={entry.name} value={entry.name}>
                  {categoryLabel(entry.label ?? entry.name)}
                </option>
              ))}
            </select>

            <IconButton
              icon="refresh"
              label="Actualizar resultados"
              onClick={() => void runSearch(0, false, true)}
              disabled={searching || !target}
            />
          </div>

          <div className="catalog-summary">
            <span>
              {searching && projects.length === 0
                ? 'Buscando en Modrinth...'
                : `${formatNumber(total)} ${isTexture ? 'paquetes' : 'mods'} para ${target?.baseVersion ?? 'tu versión'}`}
            </span>
            <span className="catalog-source">
              <Icon name="shield" size={13} />
              Descargas verificadas con SHA1
            </span>
          </div>

          {searchError ? (
            <div className="catalog-error">
              <Icon name="alert" size={20} />
              <div>
                <strong>No se pudo cargar el catálogo</strong>
                <p>{searchError}</p>
              </div>
              <Button size="sm" onClick={() => void runSearch(0, false, true)}>
                Reintentar
              </Button>
            </div>
          ) : searching && projects.length === 0 ? (
            <div className="project-grid">
              {Array.from({ length: 8 }, (_, index) => (
                <div className="project-card skeleton-card" key={index}>
                  <span className="skeleton skeleton-icon" />
                  <span className="skeleton skeleton-line" />
                  <span className="skeleton skeleton-line short" />
                  <span className="skeleton skeleton-line" />
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="catalog-empty">
              <EmptyState
                icon={isTexture ? 'image' : 'puzzle'}
                title="Sin resultados"
                description={
                  query
                    ? `No encontramos ${isTexture ? 'paquetes' : 'mods'} para "${query}" en esta versión. Prueba otra búsqueda o cambia los filtros.`
                    : 'No hay contenido disponible para esta versión ahora mismo.'
                }
                action={
                  query ? (
                    <Button variant="ghost" onClick={() => setQuery('')}>
                      Limpiar búsqueda
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <>
              <div className="project-grid">
                {projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    installed={installedIds.has(project.id)}
                    onOpen={() => void openProject(project)}
                  />
                ))}
              </div>
              {projects.length < total ? (
                <div className="catalog-more">
                  <Button
                    variant="secondary"
                    loading={searching}
                    onClick={() => void runSearch(projects.length, true)}
                  >
                    Cargar más
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </>
      ) : (
        <>
          <div className="catalog-summary">
            <span>
              {installed.length} {installed.length === 1 ? 'instalado' : 'instalados'} en{' '}
              {target?.isolated ? 'el perfil aislado' : 'la carpeta del juego'}
            </span>
            <Button size="sm" variant="ghost" icon="folder" onClick={handleOpenFolder}>
              Abrir carpeta
            </Button>
          </div>

          {installedError ? (
            <div className="catalog-error">
              <Icon name="alert" size={20} />
              <div>
                <strong>No se pudo leer la biblioteca</strong>
                <p>{installedError}</p>
              </div>
              <Button size="sm" onClick={() => void loadInstalled()}>
                Reintentar
              </Button>
            </div>
          ) : installed.length === 0 ? (
            <div className="catalog-empty">
              <EmptyState
                icon={isTexture ? 'image' : 'puzzle'}
                title={isTexture ? 'Sin paquetes instalados' : 'Sin mods instalados'}
                description={
                  isTexture
                    ? 'Explora paquetes de textura compatibles y actívalos desde Opciones > Paquetes de recursos.'
                    : needsFabric
                      ? 'Prepara un perfil Fabric para empezar a instalar mods de forma segura y aislada.'
                      : 'Explora el catálogo de Modrinth e instala mods compatibles con este perfil.'
                }
                action={
                  <Button variant="primary" onClick={() => setTab('browse')}>
                    Explorar catálogo
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="installed-grid">
              {installed.map((item) => (
                <div className="installed-card" key={item.projectId}>
                  <ProjectIcon
                    project={{ title: item.title, iconUrl: item.packIconData ?? item.iconUrl ?? null, color: null }}
                    size={42}
                  />
                  <div className="installed-copy">
                    <strong>{item.title}</strong>
                    <span>
                      {item.versionNumber}
                      {item.loader === 'fabric' ? ' · Fabric' : ' · Minecraft'}
                    </span>
                    {isTexture && item.packDescription ? (
                      <span className="installed-file">{item.packDescription}</span>
                    ) : null}
                    <span className="installed-file" title={item.file}>
                      {item.file}
                      {item.size ? ` · ${formatBytes(item.size)}` : ''}
                    </span>
                  </div>
                  <div className="installed-actions">
                    {item.missing ? <Badge tone="warn">Archivo ausente</Badge> : null}
                    {!isTexture && !item.missing ? (
                      <button
                        type="button"
                        className={`mod-switch ${item.enabled === false ? '' : 'is-on'}`}
                        role="switch"
                        aria-checked={item.enabled !== false}
                        aria-label={`${item.enabled === false ? 'Activar' : 'Desactivar'} ${item.title}`}
                        disabled={togglingMod !== null}
                        onClick={() => void handleToggleMod(item)}
                      >
                        <span />
                        {togglingMod === item.projectId
                          ? 'Aplicando…'
                          : item.enabled === false ? 'Desactivado' : 'Activo'}
                      </button>
                    ) : null}
                    {item.managed === false ? (
                      <Badge tone="neutral">Archivo local</Badge>
                    ) : (
                      <IconButton
                        icon="trash"
                        label={`Quitar ${item.title}`}
                        onClick={() => setPendingRemove(item)}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={Boolean(detailId)}
        title={detail?.project.title ?? 'Cargando proyecto'}
        onClose={closeDetail}
        footer={
          detailLoading || detailError ? undefined : detail ? (
            <>
              <Button
                variant="ghost"
                icon="external"
                onClick={() =>
                  void window.launcher
                    .openExternal(
                      `https://modrinth.com/${kind === 'mod' ? 'mod' : 'resourcepack'}/${detail.project.slug}`
                    )
                    .catch((error) => notify(errorMessage(error), 'error'))
                }
              >
                Ver en Modrinth
              </Button>
              {currentInstalled ? (
                <Button
                  variant="danger"
                  icon="trash"
                  onClick={() => {
                    closeDetail()
                    setPendingRemove(currentInstalled)
                  }}
                >
                  Quitar
                </Button>
              ) : kind === 'mod' && target?.loader !== 'fabric' ? (
                <Button
                  variant="primary"
                  icon="sparkles"
                  loading={operation === 'fabric'}
                  disabled={Boolean(operation)}
                  onClick={() => void handlePrepareFabric()}
                >
                  Instalar Fabric
                </Button>
              ) : (
                <Button
                  variant="primary"
                  icon="download"
                  disabled={!canInstall || Boolean(operation)}
                  onClick={() => void handleInstall()}
                >
                  Instalar
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        {detailLoading ? (
          <div className="detail-loading">
            <span className="spinner" aria-hidden="true" />
            <span>Cargando información de Modrinth...</span>
          </div>
        ) : detailError ? (
          <div className="detail-error">
            <Icon name="alert" size={22} />
            <p>{detailError}</p>
            <Button
              size="sm"
              onClick={() => {
                const project = projects.find((entry) => entry.id === detailId)
                if (project) void openProject(project)
              }}
            >
              Reintentar
            </Button>
          </div>
        ) : detail ? (
          <div className="detail">
            {operation ? (
              <div className="detail-progress">
                <div>
                  <span>{progress?.message ?? 'Trabajando...'}</span>
                  <strong>{progress?.percent ?? 0}%</strong>
                </div>
                <ProgressBar value={progress?.percent ?? 0} />
              </div>
            ) : null}

            <div className="detail-head">
              <ProjectIcon project={detail.project} size={62} />
              <div>
                <h3>{detail.project.title}</h3>
                <p>
                  {detail.project.author || 'Modrinth'} ·{' '}
                  {formatNumber(detail.project.downloads)} descargas
                </p>
                <div className="project-tags">
                  {detail.project.loaders.includes('fabric') ? (
                    <Badge tone="ok">Fabric</Badge>
                  ) : null}
                  {detail.project.categories.slice(0, 3).map((entry) => (
                    <span className="tag" key={entry}>
                      {categoryLabel(entry)}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <p className="detail-description">
              {plainText(detail.body).slice(0, 900) ||
                detail.project.description ||
                'Sin descripción adicional.'}
            </p>

            {detail.license ? (
              <p className="detail-license">Licencia: {detail.license.name}</p>
            ) : null}

            <div className="detail-install">
              <label htmlFor="catalog-version">Versión compatible</label>
              {versions.length === 0 ? (
                <div className="notice notice-warn">
                  <Icon name="info" size={17} />
                  <span>
                    No hay una versión compatible con Minecraft {target?.baseVersion}. No se
                    instalará nada incompatible.
                  </span>
                </div>
              ) : (
                <>
                  <select
                    id="catalog-version"
                    className="select"
                    value={selectedVersionId}
                    onChange={(event) => setSelectedVersionId(event.target.value)}
                    disabled={Boolean(operation)}
                  >
                    {versions.map((version) => (
                      <option key={version.id} value={version.id}>
                        {version.versionNumber} · {version.versionType} ·{' '}
                        {formatDate(version.datePublished)}
                      </option>
                    ))}
                  </select>
                  {selectedVersion ? (
                    <p className="detail-version-meta">
                      {selectedVersion.files[0]?.filename ?? 'Archivo principal'} ·{' '}
                      {formatBytes(selectedVersion.files[0]?.size)}
                    </p>
                  ) : null}
                </>
              )}

              {dependencies.length > 0 ? (
                <div className="dependency-list">
                  <span>Dependencias declaradas</span>
                  <div>
                    {dependencies.slice(0, 8).map((dependency) => (
                      <span
                        className={`tag ${dependency.type === 'required' ? 'is-required' : ''}`}
                        key={`${dependency.projectId}-${dependency.type}`}
                      >
                        {dependency.name || dependency.projectId}
                        {dependency.type === 'required' ? ' · obligatoria' : ''}
                      </span>
                    ))}
                  </div>
                  <small>
                    Las dependencias obligatorias se instalan y verifican automáticamente.
                  </small>
                </div>
              ) : null}

              {isTexture ? (
                <p className="detail-note">
                  Tras instalarlo, actívalo en Minecraft: Opciones {'>'} Paquetes de recursos.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(pendingRemove)}
        title={isTexture ? 'Quitar paquete de textura' : 'Quitar mod'}
        onClose={() => setPendingRemove(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingRemove(null)}>
              Cancelar
            </Button>
            <Button variant="danger" icon="trash" onClick={() => void handleRemove()}>
              Quitar
            </Button>
          </>
        }
      >
        <p className="modal-copy">
          Se quitará <strong>{pendingRemove?.title}</strong> de este perfil. Solo se eliminará el
          archivo instalado por Odissey Client; tus mundos y ajustes no se tocarán.
        </p>
      </Modal>
    </div>
  )
}
