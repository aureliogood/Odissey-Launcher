import type { CSSProperties, JSX } from 'react'
import type {
  AccountSummary,
  CommunityContent,
  InstalledVersion,
  JavaInfo,
  LaunchProgress,
  ServerStatus,
  Settings,
  SystemInfo,
  VersionManifest
} from '../../../shared/types'
import odisseyLogo from '../assets/logo.png'
import launchNewsImage from '../assets/odissey-news-launch.png'
import { Icon } from './Icons'
import { Badge, Button, Card, IconButton } from './UI'

export type GameState = 'idle' | 'preparing' | 'running'

interface PlayViewProps {
  settings: Settings
  manifest: VersionManifest | null
  installed: InstalledVersion[]
  account: AccountSummary | null
  system: SystemInfo | null
  javaList: JavaInfo[]
  gameState: GameState
  progress: LaunchProgress | null
  versionsLoading: boolean
  versionsError: string | null
  server: ServerStatus | null
  community: CommunityContent | null
  communityLoading: boolean
  serverLoading: boolean
  serverAdding: boolean
  onSelectVersion: (id: string) => void
  onSelectRam: (ramMb: number) => void
  onLaunch: () => void
  onJoinServer: () => void
  onStop: () => void
  onOpenVersions: () => void
  onOpenAccounts: () => void
  onRetryVersions: () => void
  onRefreshServer: () => void
  onAddServer: () => void
  onCopyServer: () => void
  onRefreshCommunity: () => void
  onOpenCommunityLink: (url: string) => void
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' }).format(
      new Date(iso)
    )
  } catch {
    return ''
  }
}

function javaLabel(settings: Settings, javaList: JavaInfo[]): string {
  if (settings.javaPath) return settings.javaPath.split(/[\\/]/).pop() ?? settings.javaPath
  const best = javaList[0]
  return best ? `Java ${best.major ?? '?'} (automático)` : 'Detección automática'
}

export function PlayView({
  settings,
  manifest,
  installed,
  account,
  system,
  javaList,
  gameState,
  progress,
  versionsLoading,
  versionsError,
  server,
  community,
  communityLoading,
  serverLoading,
  serverAdding,
  onSelectVersion,
  onSelectRam,
  onLaunch,
  onJoinServer,
  onStop,
  onOpenVersions,
  onOpenAccounts,
  onRetryVersions,
  onRefreshServer,
  onAddServer,
  onCopyServer,
  onRefreshCommunity,
  onOpenCommunityLink
}: PlayViewProps): JSX.Element {
  const versionId = settings.selectedVersion || manifest?.latest.release || ''
  const version = manifest?.versions.find((item) => item.id === versionId)
  const installation = installed.find((item) => item.id === versionId)
  const selectedIsInstalled = installation?.status === 'installed'
  const fabricProfile = installation?.kind === 'fabric' ? installation : null
  const displayVersion = fabricProfile
    ? `Minecraft ${fabricProfile.baseVersion} · Fabric ${fabricProfile.loaderVersion ?? ''}`.trim()
    : versionId
  const busy = gameState === 'preparing'
  const running = gameState === 'running'

  const availableVersions = (manifest?.versions ?? []).filter(
    (item) => settings.showSnapshots || item.type === 'release'
  )
  if (version && !availableVersions.some((item) => item.id === version.id)) {
    availableVersions.unshift(version)
  }
  const installedOnly = installed.filter(
    (item) => item.status === 'installed' && !availableVersions.some((versionItem) => versionItem.id === item.id)
  )

  const serverOnline = server?.online === true
  const maintenanceActive = community?.maintenance?.active === true
  const latency = serverOnline ? server?.latencyMs ?? null : null
  const latencyTone = latency === null ? '' : latency < 80 ? 'is-fast' : latency <= 150 ? 'is-medium' : 'is-slow'
  const ramMax = system
    ? Math.min(32768, Math.max(1024, Math.floor(system.totalMemMb * 0.8)))
    : 8192
  const ramValue = Math.max(1024, Math.min(settings.ramMb, ramMax))
  const recommendedRamMb = (() => {
    if (!system) return 4096
    const total = system.totalMemMb
    const base = fabricProfile
      ? total <= 8192 ? 4096 : total <= 12288 ? 5120 : 6144
      : total <= 4096 ? 2048 : total <= 8192 ? 3072 : 4096
    const reserve = Math.max(2048, Math.round(total * 0.25))
    return Math.min(8192, ramMax, Math.max(1024, Math.round(Math.min(base, total - reserve) / 512) * 512))
  })()
  const ramShare = system ? settings.ramMb / system.totalMemMb : 0
  const buttonProgressStyle = busy
    ? ({ '--button-progress': `${Math.max(0, Math.min(100, progress?.percent ?? 0))}%` } as CSSProperties)
    : undefined
  const progressButtonText = progress
    ? `${progress.message} (${Math.round(progress.percent)}%)`
    : 'Preparando Minecraft...'

  return (
    <div className="play-view">
      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-top">
          <span className="eyebrow">
            <span className="eyebrow-dot" aria-hidden="true" />
            {account ? `Bienvenido, ${account.name}` : 'Bienvenido a Odissey Client'}
          </span>
          <span className={`hero-online ${serverOnline ? 'is-online' : ''}`}>
            <span className="hero-online-dot" aria-hidden="true" />
            {serverOnline && server?.playersOnline !== null
              ? `${server.playersOnline} en Odissey`
              : serverLoading ? 'Conectando…' : 'Servidor Odissey'}
          </span>
        </div>

        <button
          className="news-promo"
          onClick={() => onOpenCommunityLink('https://odisseymc.site/noticias.html')}
          aria-label="Abrir noticias y novedades de Odissey MC"
        >
          <img src={launchNewsImage} alt="Gran inauguración de Odissey MC: mc.odisseymc.lat" />
          <span className="news-promo-caption">
            <strong>Noticias de Odissey</strong>
            <span>Novedades, eventos y anuncios del servidor <Icon name="external" size={13} /></span>
          </span>
        </button>

        <div className="hero-body">
          <span className="hero-kicker">ODISSEY CLIENT</span>
          <h1 className="hero-title">
            Minecraft
            <span>JAVA EDITION</span>
          </h1>
          <p className="hero-subtitle">
            {displayVersion || 'Selecciona una versión'} · Tu juego, con las herramientas de Odissey.
          </p>
          <div className="hero-features">
            <span><Icon name="monitor" size={13} /> Minecraft sin overlay</span>
            <span><Icon name="versions" size={13} /> Perfiles y versiones</span>
            <span><Icon name="terminal" size={13} /> Registro de errores</span>
          </div>
        </div>

        <div className="hero-actions">
          <div className="version-picker">
            <span className="version-picker-label">
              Versión {fabricProfile ? <span className="loader-badge">FABRIC</span> : null}
            </span>
            <div className="select-wrap">
              <select
                value={versionId}
                onChange={(event) => onSelectVersion(event.target.value)}
                disabled={busy || running}
                aria-label="Versión de Minecraft"
              >
                {versionsLoading ? <option>Cargando versiones...</option> : null}
                {!versionsLoading && availableVersions.length === 0 && installedOnly.length === 0 ? (
                  <option value="">Sin versiones disponibles</option>
                ) : null}
                {fabricProfile ? (
                  <option value={versionId}>
                    {fabricProfile.baseVersion} · Fabric {fabricProfile.loaderVersion}
                  </option>
                ) : null}
                {availableVersions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id}
                    {installed.some((entry) => entry.id === item.id && entry.status === 'installed')
                      ? '  ·  instalada'
                      : ''}
                  </option>
                ))}
                {installedOnly.map((item) => (
                  <option key={item.id} value={item.id}>{item.id} · instalada localmente</option>
                ))}
              </select>
              <Icon name="chevron" size={16} />
            </div>
          </div>

          <label className="quick-ram">
            <span><span>RAM asignada</span><strong>{(ramValue / 1024).toFixed(ramValue % 1024 ? 1 : 0)} GB</strong></span>
            <small className={`quick-ram-hint ${ramShare > 0.7 ? 'is-warning' : ''}`}>
              {system
                ? ramShare > 0.7
                  ? `Más del 70% de la RAM total (${Math.round(ramShare * 100)}%). Deja memoria para Windows.`
                  : `Recomendado: ${(recommendedRamMb / 1024).toFixed(recommendedRamMb % 1024 ? 1 : 0)} GB para este equipo`
                : 'Detectando memoria del equipo…'}
            </small>
            <input
              className="range"
              type="range"
              min={1024}
              max={ramMax}
              step={512}
              value={ramValue}
              onChange={(event) => onSelectRam(Number(event.target.value))}
              disabled={busy || running}
              aria-label="Memoria RAM asignada a Minecraft"
            />
          </label>

          {running ? (
            <Button variant="danger" size="lg" icon="stop" className="play-btn" onClick={onStop}>
              Cerrar juego
            </Button>
          ) : (
            <Button
              variant={busy ? 'secondary' : 'primary'}
              size="lg"
              icon={busy ? undefined : 'play'}
              className={`play-btn ${busy ? 'is-progress' : ''}`}
              style={buttonProgressStyle}
              onClick={busy ? onStop : account ? onLaunch : onOpenAccounts}
              disabled={busy ? false : Boolean(account && (!versionId || (!selectedIsInstalled && (versionsLoading || Boolean(versionsError)))))}
              aria-label={busy ? `${progressButtonText}. Pulsa para cancelar.` : account ? 'Jugar ahora' : 'Añadir cuenta'}
              title={busy ? progress?.message : undefined}
            >
              {busy ? progressButtonText : account ? 'Jugar ahora' : 'Añadir cuenta'}
            </Button>
          )}
        </div>

        {running ? (
          <div className="hero-running">
            <span className="pulse-dot" aria-hidden="true" />
            <span>Minecraft está en ejecución</span>
            <span className="hero-running-version">{displayVersion}</span>
          </div>
        ) : null}
      </section>

      <section className="server-spotlight" aria-labelledby="odissey-server-title">
        <div className="server-glow" aria-hidden="true" />
        <div className="server-identity">
          <img className="server-mark" src={odisseyLogo} alt="Odissey" />
          <div>
            <span className="eyebrow">Servidor destacado</span>
            <h2 id="odissey-server-title">ODISSEY</h2>
            <span className="server-address">mc.odisseymc.lat</span>
          </div>
        </div>

        <div className="server-stat-grid">
          <div className="server-stat">
            <span
              className={`server-dot ${serverLoading ? 'is-checking' : serverOnline ? 'is-online' : 'is-offline'}`}
              aria-hidden="true"
            />
            <div>
              <strong>
                {serverLoading
                  ? 'Comprobando...'
                  : serverOnline
                    ? 'En línea'
                    : server
                      ? 'No disponible'
                      : 'Sin comprobar'}
              </strong>
              <span>
                {serverOnline
                  ? 'Estado del servidor'
                  : server?.online === null
                    ? 'Consultando en segundo plano'
                    : server?.cached
                      ? 'Último estado guardado'
                      : 'Comprueba tu conexión o el servidor'}
              </span>
            </div>
          </div>
          <div className="server-stat">
            <Icon name="users" size={17} />
            <div>
              <strong>
                {serverOnline && server?.playersOnline !== null
                  ? `${server.playersOnline}${server.playersMax !== null ? ` / ${server.playersMax}` : ''}`
                  : '—'}
              </strong>
              <span>Jugadores</span>
            </div>
          </div>
          <div className="server-stat">
            <Icon name="versions" size={17} />
            <div>
              <strong>{serverOnline && server?.version ? server.version : '—'}</strong>
              <span>Versión</span>
            </div>
          </div>
          <div
            className="server-stat"
            title={
              latency === null
                ? 'Latencia no disponible'
                : `Medición TCP hacia mc.odisseymc.lat: ${latency} ms. No mide pérdida de paquetes.`
            }
          >
            <Icon name="clock" size={17} />
            <div>
              <strong className={`latency-value ${latencyTone}`}>
                {serverOnline && server?.latencyMs !== null ? `${server.latencyMs} ms` : '—'}
              </strong>
              <span>Latencia</span>
            </div>
          </div>
        </div>

        <div className="server-actions">
          <button className="server-action" onClick={onCopyServer}>
            <Icon name="copy" size={16} />
            <span>Copiar IP</span>
          </button>
          <button className="server-action" onClick={onAddServer} disabled={serverAdding}>
            <Icon name="plus" size={16} />
            <span>{serverAdding ? 'Añadiendo...' : 'Añadir a Minecraft'}</span>
          </button>
          <Button
            variant="primary"
            icon={busy ? undefined : 'play'}
            className={`server-join-btn ${busy ? 'is-progress' : ''}`}
            style={buttonProgressStyle}
            onClick={busy || running ? onStop : onJoinServer}
            disabled={!busy && !running && (maintenanceActive || !account || !serverOnline)}
            aria-label={busy ? `${progressButtonText}. Pulsa para cancelar.` : 'Entrar en Odissey'}
            title={busy ? progress?.message : undefined}
          >
            {busy
              ? progressButtonText
              : running
                ? 'Cerrar juego'
                : maintenanceActive
                  ? 'En mantenimiento'
                  : account
                    ? 'Entrar en ODISSEY'
                    : 'Añadir cuenta'}
          </Button>
          <IconButton
            icon="refresh"
            label="Actualizar estado del servidor"
            onClick={onRefreshServer}
            disabled={serverLoading}
          />
        </div>

        {serverOnline && server?.motd ? (
          <p className="server-motd">{server.motd}</p>
        ) : null}
        {server && !serverOnline && server.error ? (
          <p className="server-note">
            Estado no disponible: {server.error}. Puedes copiar la IP y entrar manualmente desde
            Minecraft.
          </p>
        ) : null}
      </section>

      <section className="community-panel" aria-labelledby="community-title">
        <div className="community-heading">
          <div>
            <span className="eyebrow">Comunidad Odissey</span>
            <h2 id="community-title">Noticias y eventos</h2>
          </div>
          <div className="community-actions">
            <button className="server-action" onClick={onRefreshCommunity} disabled={communityLoading}>
              <Icon name="refresh" size={15} />
              <span>{communityLoading ? 'Actualizando…' : 'Actualizar'}</span>
            </button>
            <Button variant="secondary" icon="external" onClick={() => onOpenCommunityLink('https://odisseymc.site/tienda.html')}>
              Tienda Odissey
            </Button>
          </div>
        </div>

        {maintenanceActive ? (
          <div className="community-maintenance" role="status">
            <Icon name="alert" size={18} />
            <div>
              <strong>Servidor en mantenimiento</strong>
              <span>{community?.maintenance?.message || 'Odissey está realizando tareas de mantenimiento. Inténtalo de nuevo más tarde.'}</span>
            </div>
          </div>
        ) : null}

        {community?.error ? (
          <p className="community-note">
            {community.cached
              ? 'Sin conexión al sitio; mostramos las últimas noticias guardadas.'
              : 'No se pudo conectar con las noticias de Odissey. Puedes abrir la web para consultarlas.'}
          </p>
        ) : null}

        <div className="community-grid">
          <div className="community-column">
            <h3>Últimas noticias</h3>
            {community?.news.length ? community.news.map((item) => (
              <article className="community-item" key={item.id}>
                <div className="community-item-meta">
                  <span>{item.category}</span>
                  {item.date ? <time>{formatDate(item.date)}</time> : null}
                </div>
                <strong>{item.title}</strong>
                {item.text ? <p>{item.text.slice(0, 220)}{item.text.length > 220 ? '…' : ''}</p> : null}
              </article>
            )) : <p className="community-empty">{communityLoading ? 'Cargando noticias…' : community?.error ? 'Las noticias no están disponibles ahora.' : 'No hay noticias publicadas.'}</p>}
          </div>
          <div className="community-column">
            <h3>Próximos eventos</h3>
            {community?.events.length ? community.events.map((item) => (
              <article className="community-item community-event" key={item.id}>
                {item.date ? <time>{item.date}</time> : null}
                <strong>{item.title}</strong>
                {item.description ? <p>{item.description.slice(0, 220)}{item.description.length > 220 ? '…' : ''}</p> : null}
              </article>
            )) : <p className="community-empty">{communityLoading ? 'Cargando eventos…' : community?.error ? 'Los eventos no están disponibles ahora.' : 'No hay eventos programados.'}</p>}
          </div>
        </div>
        <div className="community-footer">
          <span>{community?.cached ? 'Última copia local' : community?.fetchedAt ? `Actualizado ${formatDate(community.fetchedAt)}` : 'Conectando con Odissey…'}</span>
          <button className="link-btn" onClick={() => onOpenCommunityLink('https://odisseymc.site/noticias.html')}>Ver noticias en la web</button>
        </div>
      </section>

      <div className="play-grid">
        <Card
          title="Tu cuenta"
          subtitle="Identidad usada al iniciar el juego"
          action={<button className="link-btn" onClick={onOpenAccounts}>Gestionar</button>}
        >
          {account ? (
            <div className="account-summary">
              <span className="avatar avatar-lg">{account.name.slice(0, 1).toUpperCase()}</span>
              <div className="account-summary-copy">
                <strong>{account.name}</strong>
                <span className="mono subtle">{account.uuid}</span>
                <Badge tone={account.type === 'microsoft' ? 'gold' : 'neutral'}>
                  {account.type === 'microsoft' ? 'Microsoft' : 'Offline'}
                </Badge>
              </div>
            </div>
          ) : (
            <div className="inline-empty">
              <Icon name="users" size={22} />
              <p>No hay ninguna cuenta seleccionada.</p>
              <Button size="sm" icon="plus" onClick={onOpenAccounts}>
                Añadir cuenta
              </Button>
            </div>
          )}
        </Card>

        <Card title="Rendimiento" subtitle="Configuración aplicada al iniciar">
          <ul className="stat-list">
            <li>
              <span className="stat-icon"><Icon name="cpu" size={17} /></span>
              <span>
                <strong>{settings.ramMb} MB de RAM</strong>
                <small>{system ? `${Math.round(system.totalMemMb / 1024)} GB en el sistema` : 'Memoria asignada'}</small>
              </span>
            </li>
            <li>
              <span className="stat-icon"><Icon name="terminal" size={17} /></span>
              <span>
                <strong>{javaLabel(settings, javaList)}</strong>
                <small>Entorno de Java</small>
              </span>
            </li>
            <li>
              <span className="stat-icon"><Icon name="monitor" size={17} /></span>
              <span>
                <strong>
                  {settings.customResolution
                    ? `${settings.resolutionWidth} × ${settings.resolutionHeight}`
                    : 'Ventana predeterminada'}
                </strong>
                <small>Resolución de juego</small>
              </span>
            </li>
          </ul>
        </Card>

        <Card
          title="Instalación"
          subtitle="Estado de la versión seleccionada"
          action={<button className="link-btn" onClick={onOpenVersions}>Ver versiones</button>}
        >
          {versionsError ? (
            <div className="inline-empty">
              <Icon name="alert" size={22} />
              <p>
                {selectedIsInstalled
                  ? 'Sin conexión con el catálogo. Puedes iniciar esta versión instalada; las descargas y el multijugador necesitan Internet.'
                  : 'No se pudo conectar al catálogo. Una versión instalada puede seguir iniciándose sin conexión.'}
              </p>
              <Button size="sm" icon="refresh" onClick={onRetryVersions}>
                Reintentar
              </Button>
            </div>
          ) : version || installation ? (
            <div className="install-summary">
              <div className="install-summary-head">
                <strong>{displayVersion}</strong>
                <Badge
                  tone={
                    installation?.status === 'installed'
                      ? 'ok'
                      : installation?.status === 'partial'
                        ? 'warn'
                        : 'neutral'
                  }
                >
                  {installation?.status === 'installed'
                    ? 'Instalada'
                    : installation?.status === 'partial'
                      ? 'Incompleta'
                      : 'No instalada'}
                </Badge>
              </div>
              <dl className="meta-grid">
                <div>
                  <dt>Tipo</dt>
                  <dd className="capitalize">{fabricProfile ? 'Fabric' : version?.type}</dd>
                </div>
                <div>
                  <dt>{fabricProfile ? 'Instalado' : 'Publicada'}</dt>
                  <dd>{formatDate(fabricProfile ? fabricProfile.installedAt : version?.releaseTime)}</dd>
                </div>
                <div>
                  <dt>Versiones instaladas</dt>
                  <dd>{installed.filter((item) => item.status === 'installed').length}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="inline-empty">
              <Icon name="versions" size={22} />
              <p>Selecciona una versión para ver su estado.</p>
            </div>
          )}
        </Card>
      </div>

      <Card title="Cómo empezar" subtitle="Tres pasos, sin configuraciones eternas">
        <ol className="steps">
          <li>
            <span className="step-index">01</span>
            <span>
              <strong>Elige tu identidad</strong>
              <small>Inicia sesión con Microsoft o crea un perfil offline para jugar en local.</small>
            </span>
          </li>
          <li>
            <span className="step-index">02</span>
            <span>
              <strong>Selecciona la versión</strong>
              <small>La primera vez se descargan cliente, librerías y recursos automáticamente.</small>
            </span>
          </li>
          <li>
            <span className="step-index">03</span>
            <span>
              <strong>Pulsa Jugar</strong>
              <small>Odissey Client prepara Java, verifica archivos y abre Minecraft.</small>
            </span>
          </li>
        </ol>
      </Card>
    </div>
  )
}
