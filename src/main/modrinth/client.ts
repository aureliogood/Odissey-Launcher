import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import type {
  CatalogCategory,
  CatalogDependency,
  CatalogProject,
  CatalogProjectDetail,
  CatalogSearchRequest,
  CatalogSearchResult,
  CatalogVersion
} from '../../shared/types'
import type {
  RawCategory,
  RawProject,
  RawSearchResponse,
  RawVersion
} from './types'

const API = 'https://api.modrinth.com/v2'
const USER_AGENT = 'OdisseyClient/1.0.0 (Minecraft launcher)'
const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,32}$/
const LOADER_CATEGORIES = new Set([
  'fabric',
  'forge',
  'neoforge',
  'quilt',
  'liteloader',
  'modloader',
  'rift'
])

const TTL = {
  search: 2 * 60 * 1000,
  project: 30 * 60 * 1000,
  versions: 10 * 60 * 1000,
  tags: 24 * 60 * 60 * 1000
}

interface CacheEntry {
  at: number
  data: unknown
}

const memory = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<unknown>>()
let cacheDir = join(tmpdir(), 'odissey-modrinth-cache')

export function setCatalogCacheDir(dir: string): void {
  cacheDir = dir
}

function cacheKey(path: string): string {
  return createHash('sha1').update(path).digest('hex')
}

function cacheFile(path: string): string {
  return join(cacheDir, `${cacheKey(path)}.json`)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function validProjectId(value: string): string {
  if (!PROJECT_ID_PATTERN.test(value)) throw new Error('Proyecto no válido')
  return value
}

function validVersionToken(value: string | undefined): string {
  if (!value || !VERSION_PATTERN.test(value)) throw new Error('Token no válido')
  return value
}

function httpError(status: number): Error {
  if (status === 404) return new Error('No se encontró el proyecto en Modrinth')
  if (status === 429) {
    return new Error('Modrinth está limitando las peticiones. Espera un momento e inténtalo de nuevo.')
  }
  if (status >= 500) {
    return new Error('Modrinth no está disponible ahora mismo. Inténtalo en unos minutos.')
  }
  return new Error(`Modrinth respondió con un error (${status}).`)
}

async function requestJson<T>(
  path: string,
  signal: AbortSignal | undefined,
  force: boolean
): Promise<T> {
  const key = cacheKey(path)

  if (!force) {
    const pending = inFlight.get(key)
    if (pending) return pending as Promise<T>
  }

  const task = (async (): Promise<T> => {
    const timeout = AbortSignal.timeout(15000)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
    let response: Response

    try {
      response = await fetch(`${API}${path}`, {
        signal: combined,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json'
        }
      })
    } catch (error) {
      if (signal?.aborted) throw error
      throw new Error('No se pudo conectar con Modrinth. Comprueba tu conexión.')
    }

    if (!response.ok) throw httpError(response.status)
    return (await response.json()) as T
  })()

  inFlight.set(key, task)
  try {
    return await task
  } finally {
    inFlight.delete(key)
  }
}

async function cachedJson<T>(
  path: string,
  ttl: number,
  signal: AbortSignal | undefined,
  force: boolean
): Promise<T> {
  const key = cacheKey(path)

  if (!force) {
    const cached = memory.get(key)
    if (cached && Date.now() - cached.at < ttl) return cached.data as T

    try {
      const parsed = JSON.parse(await fs.readFile(cacheFile(path), 'utf8')) as CacheEntry
      if (parsed && typeof parsed.at === 'number' && Date.now() - parsed.at < ttl) {
        memory.set(key, parsed)
        return parsed.data as T
      }
    } catch {
      // Sin caché en disco
    }
  }

  const data = await requestJson<T>(path, signal, force)
  const entry: CacheEntry = { at: Date.now(), data }
  memory.set(key, entry)
  void fs
    .mkdir(dirname(cacheFile(path)), { recursive: true })
    .then(() => fs.writeFile(cacheFile(path), JSON.stringify(entry), 'utf8'))
    .catch(() => undefined)
  return data
}

function mapSearchProject(hit: RawSearchResponse['hits'][number]): CatalogProject {
  return {
    id: hit.project_id,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    author: hit.author,
    iconUrl: hit.icon_url,
    downloads: hit.downloads,
    followers: hit.follows,
    categories: (hit.display_categories?.length ? hit.display_categories : hit.categories).filter(
      (category) => !LOADER_CATEGORIES.has(category)
    ),
    gameVersions: hit.versions,
    loaders: hit.categories.filter((category) => LOADER_CATEGORIES.has(category)),
    projectType: hit.project_type,
    updatedAt: hit.date_modified,
    color: hit.color ?? null
  }
}

function mapProject(raw: RawProject): CatalogProject {
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    description: raw.description,
    author: '',
    iconUrl: raw.icon_url,
    downloads: raw.downloads,
    followers: raw.followers,
    categories: [...raw.categories, ...raw.additional_categories].filter(
      (category) => !LOADER_CATEGORIES.has(category)
    ),
    gameVersions: raw.game_versions,
    loaders: raw.loaders,
    projectType: raw.project_type,
    updatedAt: raw.updated,
    color: raw.color ?? null
  }
}

function mapDependency(raw: RawVersion['dependencies'][number]): CatalogDependency | null {
  if (!raw.project_id) return null
  return {
    projectId: raw.project_id,
    versionId: raw.version_id,
    type: raw.dependency_type
  }
}

export function mapVersion(raw: RawVersion): CatalogVersion {
  return {
    id: raw.id,
    projectId: raw.project_id,
    name: raw.name,
    versionNumber: raw.version_number,
    versionType: raw.version_type,
    datePublished: raw.date_published,
    downloads: raw.downloads,
    gameVersions: raw.game_versions,
    loaders: raw.loaders,
    files: raw.files.map((file) => ({
      url: file.url,
      filename: file.filename,
      size: file.size,
      sha1: file.hashes.sha1 ?? '',
      sha512: file.hashes.sha512,
      primary: file.primary
    })),
    dependencies: raw.dependencies
      .map(mapDependency)
      .filter((dependency): dependency is CatalogDependency => dependency !== null)
  }
}

function searchFacets(request: CatalogSearchRequest): string {
  const facets: string[][] = [
    [`project_type:${request.kind === 'mod' ? 'mod' : 'resourcepack'}`]
  ]

  if (request.kind === 'mod') facets.push(['categories:fabric'])
  if (request.gameVersion) {
    facets.push([`versions:${validVersionToken(request.gameVersion)}`])
  }
  if (request.category) {
    if (!/^[a-z0-9-]{1,48}$/.test(request.category)) throw new Error('Categoría no válida')
    facets.push([`categories:${request.category}`])
  }

  return JSON.stringify(facets)
}

export async function searchCatalog(
  request: CatalogSearchRequest,
  signal?: AbortSignal
): Promise<CatalogSearchResult> {
  const limit = Math.min(40, Math.max(1, Math.round(request.limit)))
  const offset = Math.max(0, Math.round(request.offset))
  const query = request.query.trim().slice(0, 100)
  const index = ['relevance', 'downloads', 'follows', 'newest', 'updated'].includes(request.sort)
    ? request.sort
    : 'relevance'

  const params = new URLSearchParams({
    query,
    index,
    offset: String(offset),
    limit: String(limit),
    facets: searchFacets(request)
  })

  const raw = await cachedJson<RawSearchResponse>(
    `/search?${params.toString()}`,
    TTL.search,
    signal,
    request.force === true
  )

  if (!raw || !Array.isArray(raw.hits)) throw new Error('Modrinth devolvió una respuesta no válida')

  return {
    projects: raw.hits.map(mapSearchProject),
    total: raw.total_hits,
    offset: raw.offset,
    limit: raw.limit
  }
}

interface RawTeamMember {
  role: string
  ordering: number
  user: { username: string }
}

async function getProjectAuthor(
  teamId: string | undefined,
  signal?: AbortSignal
): Promise<string> {
  if (!teamId || !PROJECT_ID_PATTERN.test(teamId)) return ''
  try {
    const members = await cachedJson<RawTeamMember[]>(
      `/team/${teamId}/members`,
      TTL.project,
      signal,
      false
    )
    const owner = members.find((member) => member.role === 'owner') ?? members[0]
    return owner?.user.username ?? ''
  } catch {
    return ''
  }
}

export async function getProject(
  projectId: string,
  signal?: AbortSignal,
  force = false
): Promise<CatalogProjectDetail> {
  const id = validProjectId(projectId)
  const raw = await cachedJson<RawProject>(`/project/${id}`, TTL.project, signal, force)

  const project = mapProject(raw)
  project.author = await getProjectAuthor(raw.team, signal)

  return {
    project,
    body: typeof raw.body === 'string' ? raw.body : '',
    gallery: Array.isArray(raw.gallery)
      ? raw.gallery.map((image) => ({ url: image.url, title: image.title }))
      : [],
    license: raw.license
      ? { id: raw.license.id, name: raw.license.name, url: raw.license.url ?? undefined }
      : undefined,
    sourceUrl: raw.source_url ?? undefined,
    issuesUrl: raw.issues_url ?? undefined,
    wikiUrl: raw.wiki_url ?? undefined,
    discordUrl: raw.discord_url ?? undefined
  }
}

export async function getProjectRaw(
  projectId: string,
  signal?: AbortSignal,
  force = false
): Promise<RawProject> {
  const id = validProjectId(projectId)
  return cachedJson<RawProject>(`/project/${id}`, TTL.project, signal, force)
}

export async function getVersions(
  projectId: string,
  signal?: AbortSignal,
  force = false
): Promise<CatalogVersion[]> {
  const id = validProjectId(projectId)
  const raw = await cachedJson<RawVersion[]>(
    `/project/${id}/version`,
    TTL.versions,
    signal,
    force
  )
  if (!Array.isArray(raw)) throw new Error('Modrinth devolvió versiones no válidas')
  return raw.map(mapVersion)
}

export async function getVersionRaw(
  versionId: string,
  signal?: AbortSignal,
  force = false
): Promise<RawVersion> {
  const id = validProjectId(versionId)
  return cachedJson<RawVersion>(`/version/${id}`, TTL.versions, signal, force)
}

export async function getDependencies(
  versionId: string,
  signal?: AbortSignal
): Promise<CatalogDependency[]> {
  const version = await getVersionRaw(versionId, signal)
  const dependencies = version.dependencies
    .map(mapDependency)
    .filter((dependency): dependency is CatalogDependency => dependency !== null)

  const enriched = await Promise.all(
    dependencies.slice(0, 12).map(async (dependency) => {
      if (dependency.type !== 'required' && dependency.type !== 'optional') return dependency
      try {
        const project = await getProjectRaw(dependency.projectId, signal)
        return { ...dependency, name: project.title, slug: project.slug }
      } catch {
        return dependency
      }
    })
  )

  return enriched
}

export async function getCategories(kind: 'mod' | 'resourcepack'): Promise<CatalogCategory[]> {
  const raw = await cachedJson<RawCategory[]>('/tag/category', TTL.tags, undefined, false)
  if (!Array.isArray(raw)) return []

  const blocked = new Set([
    'fabric',
    'forge',
    'neoforge',
    'quilt',
    'liteloader',
    'modloader',
    'rift',
    'risugamis_modloader',
    'bukkit',
    'spigot',
    'paper',
    'purpur',
    'folia',
    'sponge',
    'bungeecord',
    'velocity',
    'waterfall',
    'minecraft',
    'client',
    'server',
    'datapack'
  ])

  return raw
    .filter((category) => category.project_type === kind)
    .filter((category) => !blocked.has(category.name))
    .map((category) => ({ name: category.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function getCompatibleVersion(
  projectId: string,
  gameVersion: string,
  loader: 'fabric' | 'minecraft',
  signal?: AbortSignal
): Promise<CatalogVersion | null> {
  const versions = await getVersions(projectId, signal)
  return (
    versions.find(
      (version) =>
        version.gameVersions.includes(gameVersion) && version.loaders.includes(loader)
    ) ?? null
  )
}

export function isCompatible(
  version: CatalogVersion,
  gameVersion: string,
  loader: 'fabric' | 'minecraft'
): boolean {
  return version.gameVersions.includes(gameVersion) && version.loaders.includes(loader)
}

export function assertDownloadUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('La descarga tiene una URL no válida')
  }

  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.modrinth.com')) {
    throw new Error('La descarga no procede de un servidor permitido de Modrinth')
  }
}

export async function withRetry<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error
      await delay(attempt * 500)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('La operación falló')
}
