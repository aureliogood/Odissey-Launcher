import AdmZip from 'adm-zip'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, promises as fs, writeFileSync } from 'node:fs'
import { delimiter, dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import type {
  InstalledVersion,
  LaunchProgress,
  VersionManifest,
  VersionSummary
} from '../../shared/types'
import { downloadAll, downloadFile, fetchJson, type DownloadTask } from './http'
import { detectJava, getJavaVersion } from './java'
import { rulesAllow, type FeatureSet } from './rules'
import type {
  AssetIndexContent,
  Library,
  VersionArgument,
  VersionDetails
} from './types'

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const RESOURCES_URL = 'https://resources.download.minecraft.net'
const LAUNCHER_NAME = 'OdisseyClient'
const LAUNCHER_VERSION = '1.0.0'
const MANIFEST_TTL = 5 * 60 * 1000
const VERSION_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

let manifestCache: { data: VersionManifest; at: number } | null = null

export interface GameSession {
  name: string
  uuid: string
  accessToken: string
  userType: 'msa' | 'legacy'
  xuid?: string
  clientId?: string
}

export interface InstallResult {
  versionId: string
  details: VersionDetails
  versionDir: string
  clientJar: string
  nativesDir: string
  classpath: string[]
  loggingArgument?: string
}

export interface InstallMetadata {
  kind?: 'vanilla' | 'fabric' | 'forge' | 'optifine'
  baseVersion?: string
  loaderVersion?: string
}

export interface InstallOptions {
  versionId: string
  root: string
  signal: AbortSignal
  onProgress: (progress: LaunchProgress) => void
  metadata?: InstallMetadata
}

export interface LaunchOptions extends InstallOptions {
  session: GameSession
  ramMb: number
  javaPath?: string
  extraJvmArgs?: string
  customResolution?: boolean
  autoCloseLauncher?: boolean
  resolutionWidth?: number
  resolutionHeight?: number
  instanceDir?: string
  quickPlayServer?: string
  quickPlaySingleplayer?: string
  onLog: (line: string) => void
}

interface LocalVersionDetails extends VersionDetails {
  inheritsFrom?: string
}

export interface InstalledMarker extends InstallMetadata {
  versionId: string
  installedAt?: string
}

export interface RunningGame {
  process: ChildProcess
  version: string
}

function scaled(start: number, end: number, done: number, total: number): number {
  if (total <= 0) return end
  return start + ((end - start) * done) / total
}

function assertVersionId(versionId: string): void {
  if (!VERSION_ID_PATTERN.test(versionId) || versionId === '.' || versionId === '..') {
    throw new Error('Identificador de versión no válido')
  }
}

function safeJoin(root: string, target: string): string {
  const base = resolve(root)
  const full = resolve(base, target)
  const rel = relative(base, full)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('La versión incluye una ruta de archivo no válida')
  }
  return full
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.tmp`
  await fs.writeFile(temp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(temp, path)
}

export async function getVersionManifest(root: string, force = false): Promise<VersionManifest> {
  const cacheFile = join(root, '.odissey', 'manifest.json')

  if (!force && manifestCache && Date.now() - manifestCache.at < MANIFEST_TTL) {
    return manifestCache.data
  }

  const disk = force
    ? null
    : await readJsonFile<{ at: number; data: VersionManifest }>(cacheFile)

  if (disk && Date.now() - disk.at < MANIFEST_TTL && Array.isArray(disk.data?.versions)) {
    manifestCache = { data: disk.data, at: disk.at }
    return disk.data
  }

  try {
    const data = await fetchJson<VersionManifest>(MANIFEST_URL)
    if (!Array.isArray(data.versions)) throw new Error('Manifest inválido')
    manifestCache = { data, at: Date.now() }
    void writeJsonAtomic(cacheFile, { at: Date.now(), data }).catch(() => undefined)
    return data
  } catch (error) {
    if (disk && Array.isArray(disk.data?.versions)) {
      manifestCache = { data: disk.data, at: Date.now() }
      return disk.data
    }
    throw error
  }
}

function mergeVersionDetails(
  parent: VersionDetails,
  child: LocalVersionDetails
): VersionDetails {
  const libraries = new Map(parent.libraries.map((library) => [library.name, library]))
  for (const library of child.libraries ?? []) libraries.set(library.name, library)

  const argumentsField =
    parent.arguments || child.arguments
      ? {
          game: [...(parent.arguments?.game ?? []), ...(child.arguments?.game ?? [])],
          jvm: [...(parent.arguments?.jvm ?? []), ...(child.arguments?.jvm ?? [])]
        }
      : undefined

  return {
    ...parent,
    ...child,
    id: child.id,
    type: child.type || parent.type,
    mainClass: child.mainClass || parent.mainClass,
    assets: child.assets || parent.assets,
    assetIndex: child.assetIndex ?? parent.assetIndex,
    downloads: child.downloads?.client ? child.downloads : parent.downloads,
    libraries: [...libraries.values()],
    arguments: argumentsField,
    minecraftArguments: child.minecraftArguments ?? parent.minecraftArguments,
    javaVersion: child.javaVersion ?? parent.javaVersion,
    logging: child.logging ?? parent.logging,
    releaseTime: child.releaseTime ?? parent.releaseTime,
    time: child.time ?? parent.time
  }
}

async function resolveVersionDetails(
  root: string,
  versionId: string,
  signal: AbortSignal,
  depth = 0
): Promise<{ details: VersionDetails; versionDir: string }> {
  if (depth > 5) throw new Error('La versión tiene demasiadas dependencias de perfil')
  assertVersionId(versionId)

  const versionDir = join(root, 'versions', versionId)
  const jsonPath = join(versionDir, `${versionId}.json`)
  const local = await readJsonFile<LocalVersionDetails>(jsonPath)

  if (local?.inheritsFrom) {
    const parent = await resolveVersionDetails(root, local.inheritsFrom, signal, depth + 1)
    return { details: mergeVersionDetails(parent.details, local), versionDir }
  }

  if (local && local.id === versionId && local.downloads?.client) {
    return { details: local, versionDir }
  }

  const manifest = await getVersionManifest(root)
  const summary = manifest.versions.find((version) => version.id === versionId)
  if (!summary) {
    throw new Error(`No se encontró la versión ${versionId}. Instálala desde el catálogo.`)
  }
  return loadVersionDetails(root, summary, signal)
}

async function loadVersionDetails(
  root: string,
  summary: VersionSummary,
  signal: AbortSignal
): Promise<{ details: VersionDetails; versionDir: string }> {
  assertVersionId(summary.id)
  const versionDir = join(root, 'versions', summary.id)
  const jsonPath = join(versionDir, `${summary.id}.json`)

  const cached = await readJsonFile<VersionDetails>(jsonPath)
  if (cached && cached.id === summary.id && cached.downloads?.client) {
    return { details: cached, versionDir }
  }

  const details = await fetchJson<VersionDetails>(summary.url, signal)
  if (!details?.downloads?.client?.url) throw new Error('Metadatos de versión inválidos')
  await writeJsonAtomic(jsonPath, details)
  return { details, versionDir }
}

function libraryPath(name: string): string {
  const [group, artifact, version, classifier] = name.split(':')
  const file = classifier ? `${artifact}-${version}-${classifier}.jar` : `${artifact}-${version}.jar`
  return join(...group.split('.'), artifact, version, file)
}

function substitute(value: string, variables: Record<string, string>): string {
  return value.replace(/\$\{([^}]+)\}/g, (_match, key: string) => variables[key] ?? '')
}

function buildArguments(
  entries: Array<string | VersionArgument> | undefined,
  variables: Record<string, string>,
  features: FeatureSet
): string[] {
  if (!entries) return []

  const args: string[] = []

  for (const entry of entries) {
    if (typeof entry === 'string') {
      args.push(substitute(entry, variables))
      continue
    }

    if (!rulesAllow(entry.rules, features)) continue

    const values = Array.isArray(entry.value) ? entry.value : [entry.value]
    for (const value of values) args.push(substitute(value, variables))
  }

  return args
}

function extractNatives(jarPath: string, nativesDir: string, exclude: string[]): void {
  const zip = new AdmZip(jarPath)
  const root = resolve(nativesDir)

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue

    const name = entry.entryName.replace(/\\/g, '/')
    if (name.startsWith('META-INF/')) continue
    if (exclude.some((prefix) => name.startsWith(prefix))) continue

    const target = resolve(root, normalize(name))
    if (target !== root && !target.startsWith(root + sep)) continue

    const data = entry.getData()
    if (!data || data.length === 0) continue
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, data)
  }
}

function parseExtraArgs(raw: string): string[] {
  if (!raw.trim()) return []

  const args: string[] = []
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(raw)) !== null) {
    const value = match[1] ?? match[2] ?? match[3] ?? ''
    if (!value) continue
    if (/^-Xm[sx]/i.test(value)) {
      throw new Error('No incluyas -Xmx o -Xms en los argumentos extra: usa el control de memoria')
    }
    if (/^-cp$|^-classpath$|^-jar$/i.test(value)) {
      throw new Error('Los argumentos extra no pueden reemplazar el classpath de Minecraft')
    }
    args.push(value)
  }

  return args
}

function reportDownload(
  report: (progress: LaunchProgress) => void,
  stage: LaunchProgress['stage'],
  label: string,
  startPercent: number,
  endPercent: number
): {
  progress: (doneBytes: number, totalBytes: number, doneCount: number, totalCount: number) => void
  detail: (detail: { currentFile: string | null; doneCount: number; totalCount: number }) => void
} {
  let currentFile: string | null = null
  let lastAt = Date.now()
  let lastBytes = 0
  let speed = 0

  return {
    detail: (detail) => {
      currentFile = detail.currentFile
    },
    progress: (doneBytes, totalBytes, doneCount, totalCount) => {
      const now = Date.now()
      if (now - lastAt >= 350) {
        const instant = ((doneBytes - lastBytes) * 1000) / (now - lastAt)
        speed = speed > 0 ? speed * 0.65 + instant * 0.35 : instant
        lastAt = now
        lastBytes = doneBytes
      }
      const percent =
        totalBytes > 0
          ? scaled(startPercent, endPercent, doneBytes, totalBytes)
          : scaled(startPercent, endPercent, doneCount, totalCount)
      const etaSeconds =
        speed > 1024 && totalBytes > doneBytes
          ? Math.max(1, Math.round((totalBytes - doneBytes) / speed))
          : null

      report({
        stage,
        message: totalCount > 1 ? `${label} (${doneCount}/${totalCount})` : label,
        percent,
        current: doneCount,
        total: totalCount,
        bytesDone: doneBytes,
        bytesTotal: totalBytes,
        currentFile: currentFile ?? undefined,
        bytesPerSecond: speed > 0 ? Math.round(speed) : undefined,
        etaSeconds
      })
    }
  }
}

async function installAssets(
  details: VersionDetails,
  root: string,
  signal: AbortSignal,
  report: (progress: LaunchProgress) => void
): Promise<void> {
  const indexInfo = details.assetIndex
  if (!indexInfo) return

  assertVersionId(indexInfo.id)
  const indexPath = join(root, 'assets', 'indexes', `${indexInfo.id}.json`)

  report({
    stage: 'assets',
    message: 'Preparando índice de assets...',
    percent: 50,
    current: 0,
    total: 1
  })

  const indexReporter = reportDownload(
    report,
    'assets',
    'Descargando índice de assets',
    50,
    52
  )
  await downloadAll(
    [{ url: indexInfo.url, dest: indexPath, sha1: indexInfo.sha1, size: indexInfo.size }],
    1,
    signal,
    indexReporter.progress,
    indexReporter.detail
  )

  const content = JSON.parse(await fs.readFile(indexPath, 'utf8')) as AssetIndexContent
  const entries = Object.entries(content.objects ?? {})
  const tasks: DownloadTask[] = entries.map(([, object]) => {
    const prefix = object.hash.slice(0, 2)
    return {
      url: `${RESOURCES_URL}/${prefix}/${object.hash}`,
      dest: join(root, 'assets', 'objects', prefix, object.hash),
      sha1: object.hash,
      size: object.size
    }
  })

  const assetsReporter = reportDownload(report, 'assets', 'Descargando assets', 52, 92)
  await downloadAll(tasks, 20, signal, assetsReporter.progress, assetsReporter.detail)

  const virtual = indexInfo.virtual || content.virtual
  const legacyResources = indexInfo.map_to_resources || content.map_to_resources
  if (!virtual && !legacyResources) return

  const destinationRoot = legacyResources
    ? join(root, 'resources')
    : join(root, 'assets', 'virtual', indexInfo.id)

  for (const [name, object] of entries) {
    if (signal.aborted) throw new Error('Instalación cancelada')
    const source = join(root, 'assets', 'objects', object.hash.slice(0, 2), object.hash)
    const target = safeJoin(destinationRoot, name)
    await fs.mkdir(dirname(target), { recursive: true })
    if (!existsSync(target)) {
      await fs.copyFile(source, target)
    }
  }
}

export async function installVersion(options: InstallOptions): Promise<InstallResult> {
  const { versionId, root, signal, onProgress } = options
  assertVersionId(versionId)

  const report = (progress: LaunchProgress): void => {
    onProgress({ ...progress, percent: Math.max(0, Math.min(100, Math.round(progress.percent))) })
  }

  const checkAborted = (): void => {
    if (signal.aborted) throw new Error('Instalación cancelada')
  }

  await fs.mkdir(root, { recursive: true })

  report({ stage: 'manifest', message: 'Consultando versiones de Minecraft...', percent: 0 })
  checkAborted()
  report({
    stage: 'version',
    message: `Preparando ${versionId}...`,
    percent: 2
  })

  const { details, versionDir } = await resolveVersionDetails(root, versionId, signal)
  const clientJar = join(versionDir, `${versionId}.jar`)

  const existingMarker = await readJsonFile<InstalledMarker>(join(versionDir, '.odissey.json'))
  const keepOptifineClient = existingMarker?.kind === 'optifine' && existsSync(clientJar)
  const clientReporter = reportDownload(
    report,
    'version',
    'Descargando cliente de Minecraft',
    3,
    14
  )
  if (!keepOptifineClient) {
    await downloadAll(
      [
        {
          url: details.downloads.client.url,
          dest: clientJar,
          sha1: details.downloads.client.sha1,
          size: details.downloads.client.size
        }
      ],
      1,
      signal,
      clientReporter.progress,
      clientReporter.detail
    )
  }

  checkAborted()

  const features: FeatureSet = {
    is_demo_user: false,
    has_custom_resolution: false,
    has_quick_plays_support: false,
    is_quick_play_singleplayer: false,
    is_quick_play_multiplayer: false,
    is_quick_play_realms: false
  }

  report({ stage: 'libraries', message: 'Preparando librerías...', percent: 14 })

  const nativesDir = join(versionDir, 'natives')

  const libraries: Library[] = details.libraries.filter((library) =>
    rulesAllow(library.rules, features)
  )
  const tasks: DownloadTask[] = []
  const seen = new Set<string>()
  const classpath: string[] = []
  const nativeJars: Array<{ path: string; excludes: string[] }> = []

  for (const library of libraries) {
    const artifact = library.downloads?.artifact
    if (artifact?.url) {
      const dest = safeJoin(
        root,
        join('libraries', artifact.path ?? libraryPath(library.name))
      )
      if (!seen.has(dest)) {
        seen.add(dest)
        tasks.push({ url: artifact.url, dest, sha1: artifact.sha1, size: artifact.size })
        classpath.push(dest)
      }
    } else if (library.url && library.name.includes(':')) {
      const path = libraryPath(library.name)
      const dest = safeJoin(root, join('libraries', path))
      if (!seen.has(dest)) {
        seen.add(dest)
        const base = library.url.endsWith('/') ? library.url : `${library.url}/`
        tasks.push({ url: `${base}${path.replace(/\\/g, '/')}`, dest })
        classpath.push(dest)
      }
    }

    if (library.natives) {
      const osName =
        process.platform === 'win32'
          ? 'windows'
          : process.platform === 'darwin'
            ? 'osx'
            : 'linux'
      const classifier = library.natives[osName]
      if (!classifier) continue

      const resolvedClassifier = classifier.replace(
        '${arch}',
        process.arch === 'x64' ? '64' : '32'
      )
      const nativeArtifact = library.downloads?.classifiers?.[resolvedClassifier]
      if (!nativeArtifact?.url) continue

      const dest = safeJoin(
        root,
        join(
          'libraries',
          nativeArtifact.path ?? libraryPath(`${library.name}:${resolvedClassifier}`)
        )
      )

      if (!seen.has(dest)) {
        seen.add(dest)
        tasks.push({
          url: nativeArtifact.url,
          dest,
          sha1: nativeArtifact.sha1,
          size: nativeArtifact.size
        })
      }

      nativeJars.push({
        path: dest,
        excludes: library.extract?.exclude ?? []
      })
    }
  }

  const librariesReporter = reportDownload(
    report,
    'libraries',
    'Descargando librerías',
    14,
    50
  )
  await downloadAll(tasks, 12, signal, librariesReporter.progress, librariesReporter.detail)

  checkAborted()

  await installAssets(details, root, signal, report)

  checkAborted()

  report({ stage: 'natives', message: 'Preparando librerías nativas...', percent: 94 })

  const nativesSignature = createHash('sha1')
    .update(nativeJars.map((native) => native.path).sort().join('|'))
    .digest('hex')
  const nativesMarker = join(versionDir, '.odissey-natives.json')
  const currentNatives = await readJsonFile<{ signature?: string }>(nativesMarker)
  const nativesReady =
    currentNatives?.signature === nativesSignature &&
    existsSync(nativesDir) &&
    (await fs.readdir(nativesDir).catch(() => [])).length > 0

  if (!nativesReady) {
    try {
      await fs.rm(nativesDir, { recursive: true, force: true })
      await fs.mkdir(nativesDir, { recursive: true })
    } catch {
      throw new Error(
        'No se pudieron actualizar las librerías nativas. Cierra cualquier instancia de Minecraft y vuelve a intentarlo.'
      )
    }

    for (const native of nativeJars) {
      if (existsSync(native.path)) {
        extractNatives(native.path, nativesDir, native.excludes)
      }
    }

    await writeJsonAtomic(nativesMarker, { signature: nativesSignature })
  }

  let loggingArgument: string | undefined
  if (details.logging?.client) {
    const logFile = details.logging.client.file
    assertVersionId(logFile.id)
    const logPath = join(root, 'assets', 'log_configs', logFile.id)
    const loggingReporter = reportDownload(
      report,
      'verify',
      'Preparando configuración de registro',
      94,
      96
    )
    await downloadAll(
      [{ url: logFile.url, dest: logPath, sha1: logFile.sha1, size: logFile.size }],
      1,
      signal,
      loggingReporter.progress,
      loggingReporter.detail
    )
    loggingArgument = details.logging.client.argument.replace('${path}', logPath)
  }

  report({ stage: 'verify', message: 'Verificando instalación...', percent: 97 })

  const clientStat = await fs.stat(clientJar).catch(() => null)
  if (!clientStat || clientStat.size === 0) {
    throw new Error('El cliente de Minecraft no se descargó correctamente')
  }

  const markerPath = join(versionDir, '.odissey.json')
  const previous = await readJsonFile<InstalledMarker>(markerPath)
  await writeJsonAtomic(markerPath, {
    ...(previous ?? {}),
    ...(options.metadata ?? {}),
    versionId,
    installedAt: previous?.installedAt ?? new Date().toISOString()
  })

  report({ stage: 'complete', message: 'Instalación lista', percent: 98 })

  return {
    versionId,
    details,
    versionDir,
    clientJar,
    nativesDir,
    classpath,
    loggingArgument
  }
}

async function chooseJava(
  javaPath: string | undefined,
  requiredMajor: number | undefined
): Promise<string> {
  const selected = javaPath?.trim()

  if (selected) {
    if (!existsSync(selected)) throw new Error(`La ruta de Java no existe: ${selected}`)
    const major = await getJavaVersion(selected)
    if (requiredMajor && major !== null && major < requiredMajor) {
      throw new Error(
        `Esta versión requiere Java ${requiredMajor} o superior, pero el Java seleccionado es ${major}.`
      )
    }
    return selected
  }

  const detected = await detectJava(requiredMajor)
  if (detected.length === 0) {
    throw new Error(
      'No se encontró Java. Instala Java 21 o superior o selecciona el ejecutable en Ajustes.'
    )
  }

  const compatible = detected
    .filter((java) => (java.major ?? 0) >= (requiredMajor ?? 0))
    .sort((a, b) => (a.major ?? 0) - (b.major ?? 0))
  const chosen = compatible[0] ?? detected[0]

  if (requiredMajor && chosen.major !== null && chosen.major < requiredMajor) {
    throw new Error(
      `Esta versión requiere Java ${requiredMajor} o superior y el Java detectado es ${chosen.major}.`
    )
  }

  return chosen.path
}

export async function launchGame(options: LaunchOptions): Promise<RunningGame> {
  const { versionId, root, signal, onProgress, onLog, session } = options

  if (!/^[A-Za-z0-9_]{1,16}$/.test(session.name)) {
    throw new Error('El nombre de la cuenta no es válido')
  }

  const report = (progress: LaunchProgress): void => {
    onProgress({ ...progress, percent: Math.max(0, Math.min(100, Math.round(progress.percent))) })
  }

  const installed = await installVersion({
    versionId,
    root,
    signal,
    onProgress: (progress) => report({ ...progress, percent: Math.min(96, progress.percent) })
  })

  if (signal.aborted) throw new Error('Inicio cancelado')

  report({ stage: 'starting', message: 'Preparando Java...', percent: 96 })

  const details = installed.details
  const requiredJava = details.javaVersion?.majorVersion
  const javaExecutable = await chooseJava(options.javaPath, requiredJava)

  const assetIndexName = details.assetIndex?.id ?? details.assets ?? 'legacy'
  const instanceDir = options.instanceDir ?? root
  await fs.mkdir(instanceDir, { recursive: true })
  const variables: Record<string, string> = {
    auth_player_name: session.name,
    auth_uuid: session.uuid,
    auth_access_token: session.accessToken,
    auth_session: session.accessToken,
    clientid: session.clientId ?? '',
    auth_xuid: session.xuid ?? '',
    user_type: session.userType,
    user_properties: '{}',
    version_name: versionId,
    version_type: details.type,
    game_directory: instanceDir,
    game_assets: join(root, 'assets', 'virtual', assetIndexName),
    assets_root: join(root, 'assets'),
    assets_index_name: assetIndexName,
    natives_directory: installed.nativesDir,
    library_directory: join(root, 'libraries'),
    launcher_name: LAUNCHER_NAME,
    launcher_version: LAUNCHER_VERSION,
    classpath: [...installed.classpath, installed.clientJar].join(delimiter),
    classpath_separator: delimiter,
    resolution_width: String(options.resolutionWidth ?? 854),
    resolution_height: String(options.resolutionHeight ?? 480),
    quickPlayPath: '',
    quickPlaySingleplayer: options.quickPlaySingleplayer ?? '',
    quickPlayMultiplayer: options.quickPlayServer ?? '',
    quickPlayRealms: ''
  }

  const features: FeatureSet = {
    is_demo_user: false,
    has_custom_resolution: Boolean(
      options.customResolution && options.resolutionWidth && options.resolutionHeight
    ),
    has_quick_plays_support: Boolean(options.quickPlaySingleplayer || options.quickPlayServer),
    is_quick_play_singleplayer: Boolean(options.quickPlaySingleplayer),
    is_quick_play_multiplayer: Boolean(options.quickPlayServer),
    is_quick_play_realms: false
  }

  const jvmArgs = details.arguments?.jvm?.length
    ? buildArguments(details.arguments.jvm, variables, features)
    : [`-Djava.library.path=${installed.nativesDir}`, '-cp', variables.classpath]

  const gameArgs = details.arguments?.game?.length
    ? buildArguments(details.arguments.game, variables, features)
    : (details.minecraftArguments ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map((argument) => substitute(argument, variables))

  const memoryArgs = [
    // Empieza con heap pequeño y deja que la JVM lo amplíe si Minecraft lo necesita.
    // Evita reservar 1 GB desde el inicio en equipos con 4 GB asignados.
    `-Xms${Math.min(512, options.ramMb)}M`,
    `-Xmx${options.ramMb}M`
  ]
  const extraArgs = parseExtraArgs(options.extraJvmArgs ?? '')
  const allJvmArgs = [...memoryArgs, ...extraArgs, ...jvmArgs]
  if (installed.loggingArgument) allJvmArgs.push(installed.loggingArgument)

  const args = [...allJvmArgs, details.mainClass, ...gameArgs]

  if (signal.aborted) throw new Error('Inicio cancelado')

  report({ stage: 'starting', message: 'Iniciando Minecraft...', percent: 99 })

  const child = spawn(javaExecutable, args, {
    cwd: instanceDir,
    env: { ...process.env },
    detached: options.autoCloseLauncher === true,
    windowsHide: true,
    stdio: options.autoCloseLauncher ? 'ignore' : ['ignore', 'pipe', 'pipe']
  })

  if (!child.pid) throw new Error('No se pudo iniciar el proceso de Java')
  if (options.autoCloseLauncher) child.unref()

  const pipeLines = (chunk: Buffer): void => {
    const lines = chunk.toString('utf8').split(/\r?\n/)
    for (const line of lines) {
      if (line.trim()) onLog(line)
    }
  }

  child.stdout?.on('data', pipeLines)
  child.stderr?.on('data', pipeLines)
  child.on('error', (error) => onLog(`[Error] ${error.message}`))

  report({
    stage: 'running',
    message: 'Minecraft se está ejecutando',
    percent: 100
  })

  return { process: child, version: versionId }
}

export async function listInstalledVersions(root: string): Promise<InstalledVersion[]> {
  const versionsDir = join(root, 'versions')
  let entries: string[]

  try {
    entries = (await fs.readdir(versionsDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }

  const result: InstalledVersion[] = []

  for (const id of entries) {
    if (!VERSION_ID_PATTERN.test(id)) continue
    const dir = join(versionsDir, id)
    const marker = await readJsonFile<InstalledMarker>(join(dir, '.odissey.json'))
    const jar = await fs.stat(join(dir, `${id}.jar`)).catch(() => null)
    const json = await fs.stat(join(dir, `${id}.json`)).catch(() => null)

    if (marker && jar && jar.size > 0) {
      result.push({
        id,
        status: 'installed',
        installedAt: marker.installedAt,
        kind: marker.kind,
        baseVersion: marker.baseVersion,
        loaderVersion: marker.loaderVersion
      })
    } else if (jar || json) {
      result.push({ id, status: 'partial' })
    }
  }

  return result.sort((a, b) => (b.installedAt ?? '').localeCompare(a.installedAt ?? ''))
}

export async function readInstalledMarker(
  root: string,
  versionId: string
): Promise<InstalledMarker | null> {
  if (!VERSION_ID_PATTERN.test(versionId)) return null
  return readJsonFile<InstalledMarker>(
    join(root, 'versions', versionId, '.odissey.json')
  )
}
