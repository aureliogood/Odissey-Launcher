import AdmZip from 'adm-zip'
import { randomUUID } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import type {
  CatalogVersion,
  ContentKind,
  FabricProfileInfo,
  InstalledContent,
  LibraryInstallRequest,
  LibraryProgress,
  LibraryTarget
} from '../../shared/types'
import { ensureFabricProfile } from '../minecraft/fabric'
import { downloadFile } from '../minecraft/http'
import {
  getVersionManifest,
  listInstalledVersions,
  readInstalledMarker
} from '../minecraft/launch'
import {
  assertDownloadUrl,
  getProjectRaw,
  getVersions,
  isCompatible,
  mapVersion
} from '../modrinth/client'
import type { RawProject } from '../modrinth/types'
import { loadSettings } from '../store'
import { contentMap, readLibrary, writeLibrary } from './store'

const VERSION_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/
const MAX_DEPENDENCIES = 24

function assertVersionId(value: string): void {
  if (!VERSION_ID_PATTERN.test(value) || value === '.' || value === '..') {
    throw new Error('La versión seleccionada no es válida')
  }
}

function report(
  onProgress: (progress: LibraryProgress) => void,
  message: string,
  percent: number,
  bytesDone?: number,
  bytesTotal?: number,
  extra?: {
    currentFile?: string
    bytesPerSecond?: number
    etaSeconds?: number | null
  }
): void {
  onProgress({
    message,
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    bytesDone,
    bytesTotal,
    ...extra
  })
}

export async function getLibraryTarget(): Promise<LibraryTarget> {
  const settings = await loadSettings()
  let versionId = settings.selectedVersion

  if (!versionId) {
    const manifest = await getVersionManifest(settings.gameDir)
    versionId = manifest.latest.release
  }

  assertVersionId(versionId)
  const marker = await readInstalledMarker(settings.gameDir, versionId)
  const isFabric = marker?.kind === 'fabric' && Boolean(marker.baseVersion)
  const baseVersion = isFabric && marker?.baseVersion ? marker.baseVersion : versionId
  assertVersionId(baseVersion)

  const loader = isFabric ? 'fabric' : 'vanilla'
  const instanceDir = isFabric
    ? join(settings.gameDir, 'instances', versionId)
    : settings.gameDir

  const installed = await listInstalledVersions(settings.gameDir)
  const fabricProfile = installed.find(
    (version) =>
      version.kind === 'fabric' &&
      version.baseVersion === baseVersion &&
      version.status === 'installed'
  )

  return {
    versionId,
    baseVersion,
    loader,
    loaderVersion: isFabric ? marker?.loaderVersion : undefined,
    instanceDir,
    modsDir: join(instanceDir, 'mods'),
    resourcepacksDir: join(instanceDir, 'resourcepacks'),
    isolated: isFabric,
    profileReady: isFabric,
    fabricProfileId: fabricProfile?.id
  }
}

export async function listInstalledContent(kind: ContentKind): Promise<InstalledContent[]> {
  const target = await getLibraryTarget()
  const data = await readLibrary(target.instanceDir)
  const items = Object.values(contentMap(data, kind))
  const directory = kind === 'mod' ? target.modsDir : target.resourcepacksDir

  const listed = await Promise.all(
    items.map(async (item) => {
      const enabledPath = join(directory, item.file)
      const disabledPath = join(directory, `${item.file}.disabled`)
      const enabled = kind === 'mod' ? existsSync(enabledPath) : undefined
      let packIconData: string | undefined
      let packDescription: string | undefined
      if (kind === 'resourcepack' && existsSync(enabledPath)) {
        try {
          const zip = new AdmZip(enabledPath)
          const icon = zip.getEntry('pack.png')
          if (icon && icon.header.size > 0 && icon.header.size <= 512 * 1024) {
            packIconData = `data:image/png;base64,${icon.getData().toString('base64')}`
          }
          const metadata = zip.getEntry('pack.mcmeta')
          if (metadata && metadata.header.size <= 128 * 1024) {
            const parsed = JSON.parse(metadata.getData().toString('utf8')) as {
              pack?: { description?: unknown }
            }
            const description = parsed.pack?.description
            packDescription = (typeof description === 'string'
              ? description
              : Array.isArray(description)
                ? description.map((part) => typeof part === 'string' ? part : String((part as { text?: unknown }).text ?? '')).join('')
                : '')
              .replace(/<[^>]*>/g, '')
              .replace(/\s+/g, ' ')
              .slice(0, 240)
          }
        } catch {
          // Un pack dañado conserva su tarjeta y se puede quitar desde la biblioteca.
        }
      }
      return {
        ...item,
        missing: !existsSync(enabledPath) && !(kind === 'mod' && existsSync(disabledPath)),
        enabled,
        packIconData,
        packDescription
      }
    })
  )
  if (kind === 'mod') {
    const trackedFiles = new Set<string>()
    for (const item of items) {
      trackedFiles.add(item.file)
      trackedFiles.add(`${item.file}.disabled`)
    }
    const files = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of files) {
      if (!entry.isFile()) continue
      const disabled = entry.name.toLowerCase().endsWith('.jar.disabled')
      if (!disabled && !entry.name.toLowerCase().endsWith('.jar')) continue
      const file = disabled ? entry.name.slice(0, -'.disabled'.length) : entry.name
      if (trackedFiles.has(entry.name) || trackedFiles.has(file)) continue
      if (!/^[A-Za-z0-9._ ()-]{1,180}\.jar$/i.test(file)) continue
      const metadata = await fs.stat(join(directory, entry.name)).catch(() => null)
      if (!metadata) continue
      const encoded = Buffer.from(file, 'utf8').toString('base64url')
      listed.push({
        kind: 'mod',
        projectId: `local-${encoded}`,
        slug: file,
        title: file.slice(0, -4),
        versionId: 'local',
        versionNumber: 'Archivo local',
        gameVersions: [target.baseVersion],
        loader: 'fabric',
        file,
        size: metadata.size,
        installedAt: metadata.mtime.toISOString(),
        missing: false,
        enabled: !disabled,
        managed: false,
        packIconData: undefined,
        packDescription: undefined
      })
    }
  }
  return listed.sort((a, b) => a.title.localeCompare(b.title))
}

export async function prepareFabricProfile(
  gameVersion: string,
  signal: AbortSignal,
  onProgress: (progress: LibraryProgress) => void
): Promise<FabricProfileInfo> {
  assertVersionId(gameVersion)
  const settings = await loadSettings()

  const info = await ensureFabricProfile({
    root: settings.gameDir,
    baseVersion: gameVersion,
    signal,
    onProgress: (progress) =>
      report(onProgress, progress.message, progress.percent)
  })

  report(onProgress, 'Perfil Fabric listo', 100)
  return info
}

interface PlanEntry {
  project: RawProject
  version: CatalogVersion
}

async function resolveVersion(
  projectId: string,
  requestedVersionId: string | undefined,
  gameVersion: string,
  loader: 'fabric' | 'minecraft',
  signal: AbortSignal
): Promise<CatalogVersion> {
  const versions = await getVersions(projectId, signal)

  if (requestedVersionId) {
    const exact = versions.find((version) => version.id === requestedVersionId)
    if (!exact) throw new Error('La versión seleccionada ya no está disponible en Modrinth')
    if (!isCompatible(exact, gameVersion, loader)) {
      throw new Error(
        `Esa versión no es compatible con Minecraft ${gameVersion} y ${loader === 'fabric' ? 'Fabric' : 'el perfil actual'}.`
      )
    }
    return exact
  }

  const compatible = versions.find((version) => isCompatible(version, gameVersion, loader))
  if (!compatible) {
    throw new Error(
      `No hay una versión compatible con Minecraft ${gameVersion} y ${loader === 'fabric' ? 'Fabric' : 'el perfil actual'}.`
    )
  }
  return compatible
}

async function buildPlan(
  request: LibraryInstallRequest,
  gameVersion: string,
  loader: 'fabric' | 'minecraft',
  existing: Record<string, InstalledContent>,
  signal: AbortSignal
): Promise<PlanEntry[]> {
  const plan: PlanEntry[] = []
  const seen = new Set<string>()

  const visit = async (
    projectId: string,
    requestedVersionId: string | undefined,
    requiredBy?: string
  ): Promise<void> => {
    if (seen.has(projectId)) return
    seen.add(projectId)

    if (plan.length >= MAX_DEPENDENCIES) {
      throw new Error('El mod tiene demasiadas dependencias. Instálalo manualmente.')
    }

    const version = await resolveVersion(projectId, requestedVersionId, gameVersion, loader, signal)
    const project = await getProjectRaw(projectId, signal)

    const expectedType = request.kind === 'mod' ? 'mod' : 'resourcepack'
    if (project.project_type !== expectedType) {
      if (requiredBy) {
        throw new Error(`${project.title} no es un ${expectedType === 'mod' ? 'mod' : 'paquete de texturas'} válido`)
      }
      throw new Error('El proyecto no es del tipo esperado')
    }

    if (requiredBy && existing[projectId]) return
    if (projectId !== request.projectId && existing[projectId]) return

    for (const dependency of version.dependencies) {
      if (dependency.type !== 'required') continue
      await visit(dependency.projectId, dependency.versionId ?? undefined, version.versionNumber)
    }

    plan.push({ project, version })
  }

  await visit(request.projectId, request.versionId)
  return plan
}

function sanitizeFilename(name: string, kind: ContentKind): string {
  const extension = kind === 'mod' ? '.jar' : '.zip'
  let clean = basename(name || '')
    .replace(/[^A-Za-z0-9._ ()-]/g, '_')
    .replace(/^[. ]+/, '')
    .slice(0, 150)

  if (!clean) clean = kind === 'mod' ? 'mod.jar' : 'pack.zip'
  if (!clean.toLowerCase().endsWith(extension)) clean += extension
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(clean.replace(/\.[^.]+$/, ''))) {
    clean = `_${clean}`
  }
  return clean
}

async function uniqueDestination(
  directory: string,
  filename: string,
  trackedFiles: Set<string>
): Promise<string> {
  const extension = filename.match(/\.[^.]+$/)?.[0] ?? ''
  const stem = filename.slice(0, filename.length - extension.length)
  let candidate = filename

  for (let index = 1; index <= 99; index += 1) {
    const target = join(directory, candidate)
    if (!existsSync(target) && !trackedFiles.has(candidate)) return target
    candidate = `${stem} (${index})${extension}`
  }

  throw new Error('No se pudo asignar un nombre de archivo libre')
}

function validateArchive(path: string, kind: ContentKind): void {
  let zip: AdmZip
  try {
    zip = new AdmZip(path)
  } catch {
    throw new Error('El archivo descargado no es un archivo válido')
  }

  const entries = zip.getEntries()

  if (kind === 'mod') {
    const ok = entries.some((entry) => entry.entryName === 'fabric.mod.json')
    if (!ok) throw new Error('El archivo no parece un mod de Fabric válido')
    return
  }

  const ok = entries.some(
    (entry) =>
      entry.entryName === 'pack.mcmeta' ||
      /^[^/]+\/pack\.mcmeta$/.test(entry.entryName)
  )
  if (!ok) throw new Error('El archivo no contiene un resource pack válido')
}

function primaryFile(version: CatalogVersion): CatalogVersion['files'][number] {
  const file = version.files.find((entry) => entry.primary) ?? version.files[0]
  if (!file) throw new Error('La versión no tiene archivos descargables')
  if (!file.sha1) throw new Error('La versión no incluye hash de verificación')
  return file
}

function safeRemove(directory: string, file: string): string {
  const name = basename(file)
  if (name !== file || !/^[A-Za-z0-9._ ()-]{1,180}$/.test(name)) {
    throw new Error('Nombre de archivo no válido')
  }
  const base = resolve(directory)
  const target = resolve(base, name)
  const path = relative(base, target)
  if (!path || path.startsWith('..') || isAbsolute(path)) {
    throw new Error('Ruta de archivo no válida')
  }
  return target
}

export async function installContent(
  request: LibraryInstallRequest,
  signal: AbortSignal,
  onProgress: (progress: LibraryProgress) => void
): Promise<InstalledContent[]> {
  if (!request || (request.kind !== 'mod' && request.kind !== 'resourcepack')) {
    throw new Error('Tipo de contenido no válido')
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(request.projectId)) {
    throw new Error('Proyecto no válido')
  }

  const target = await getLibraryTarget()
  const kind = request.kind

  if (kind === 'mod' && target.loader !== 'fabric') {
    throw new Error('Los mods necesitan un perfil Fabric. Prepara el perfil para esta versión.')
  }

  const directory = kind === 'mod' ? target.modsDir : target.resourcepacksDir
  const loader = kind === 'mod' ? 'fabric' : 'minecraft'
  await fs.mkdir(directory, { recursive: true })

  const data = await readLibrary(target.instanceDir)
  const current = contentMap(data, kind)
  const existing = current[request.projectId]

  report(onProgress, 'Resolviendo dependencias...', 2)

  let plan = await buildPlan(request, target.baseVersion, loader, current, signal)
  const mainEntry = plan.find((entry) => entry.project.id === request.projectId)
  if (!mainEntry) throw new Error('No se pudo resolver el proyecto')

  if (existing?.versionId === mainEntry.version.id && !existing.missing) {
    throw new Error('Ya está instalado en este perfil')
  }

  plan = plan.filter((entry) => {
    if (entry.project.id === request.projectId) return true
    return !current[entry.project.id]
  })

  const totalBytes = plan.reduce(
    (sum, entry) => sum + (primaryFile(entry.version).size || 0),
    0
  )
  const trackedFiles = new Set<string>()
  for (const map of [data.mods, data.resourcepacks]) {
    for (const item of Object.values(map)) trackedFiles.add(item.file)
  }

  const tempDir = join(target.instanceDir, '.odissey', 'tmp')
  await fs.mkdir(tempDir, { recursive: true })
  const created: string[] = []
  const newItems: InstalledContent[] = []
  let doneBytes = 0
  let lastAt = Date.now()
  let lastBytes = 0
  let speed = 0

  try {
    for (const entry of plan) {
      if (signal.aborted) throw new Error('Instalación cancelada')

      const file = primaryFile(entry.version)
      assertDownloadUrl(file.url)
      lastAt = Date.now()
      lastBytes = doneBytes
      speed = 0
      report(
        onProgress,
        `Descargando ${entry.project.title}...`,
        4 + (totalBytes > 0 ? (doneBytes / totalBytes) * 88 : 0),
        doneBytes,
        totalBytes,
        { currentFile: file.filename }
      )

      const temp = join(tempDir, `${randomUUID()}.download`)
      let fileBytes = 0
      try {
        await downloadFile({
          url: file.url,
          dest: temp,
          sha1: file.sha1,
          size: file.size,
          signal,
          onReset: () => {
            doneBytes = Math.max(0, doneBytes - fileBytes)
            fileBytes = 0
          },
          onBytes: (bytes) => {
            fileBytes += bytes
            doneBytes += bytes
            const now = Date.now()
            if (now - lastAt >= 350) {
              const instant = ((doneBytes - lastBytes) * 1000) / (now - lastAt)
              speed = speed > 0 ? speed * 0.65 + instant * 0.35 : instant
              lastAt = now
              lastBytes = doneBytes
            }
            report(
              onProgress,
              `Descargando ${entry.project.title}...`,
              4 + (totalBytes > 0 ? (doneBytes / totalBytes) * 88 : 0),
              doneBytes,
              totalBytes,
              {
                currentFile: file.filename,
                bytesPerSecond: speed > 0 ? Math.round(speed) : undefined,
                etaSeconds:
                  speed > 1024 && totalBytes > doneBytes
                    ? Math.max(1, Math.round((totalBytes - doneBytes) / speed))
                    : null
              }
            )
          }
        })
      } catch (error) {
        await fs.rm(temp, { force: true }).catch(() => undefined)
        throw error
      }

      validateArchive(temp, kind)

      const filename = sanitizeFilename(file.filename, kind)
      const destination = await uniqueDestination(directory, filename, trackedFiles)
      trackedFiles.add(basename(destination))
      await fs.rename(temp, destination)
      created.push(destination)

      newItems.push({
        kind,
        projectId: entry.project.id,
        slug: entry.project.slug,
        title: entry.project.title,
        iconUrl: entry.project.icon_url,
        versionId: entry.version.id,
        versionNumber: entry.version.versionNumber,
        gameVersions: entry.version.gameVersions,
        loader,
        file: basename(destination),
        size: file.size,
        installedAt: new Date().toISOString()
      })
    }

    report(onProgress, 'Guardando instalación...', 97, doneBytes, totalBytes)

    for (const item of newItems) {
      const previous = current[item.projectId]
      if (previous && previous.file !== item.file) {
        await fs
          .rm(safeRemove(directory, previous.file), { force: true })
          .catch(() => undefined)
      }
      current[item.projectId] = item
    }

    await writeLibrary(target.instanceDir, data)
  } catch (error) {
    for (const path of created) {
      await fs.rm(path, { force: true }).catch(() => undefined)
    }
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    if (signal.aborted) throw new Error('Instalación cancelada')
    throw error
  }

  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  report(onProgress, 'Instalación completada', 100, totalBytes, totalBytes)
  return listInstalledContent(kind)
}

export async function setModEnabled(projectId: string, enabled: boolean): Promise<InstalledContent[]> {
  if (!/^[A-Za-z0-9_-]{1,300}$/.test(projectId)) throw new Error('Mod no válido')
  const target = await getLibraryTarget()
  if (target.loader !== 'fabric' || !target.profileReady) throw new Error('Selecciona un perfil Fabric')
  const data = await readLibrary(target.instanceDir)
  const item = data.mods[projectId]
  let file = item?.file
  if (!file && projectId.startsWith('local-')) {
    try {
      file = Buffer.from(projectId.slice('local-'.length), 'base64url').toString('utf8')
    } catch {
      throw new Error('Mod local no válido')
    }
  }
  if (!file || !file.toLowerCase().endsWith('.jar') || basename(file) !== file || !/^[A-Za-z0-9._ ()-]{1,180}\.jar$/i.test(file)) {
    throw new Error('El mod no está instalado o no es un JAR válido')
  }
  const source = join(target.modsDir, enabled ? `${file}.disabled` : file)
  const destination = join(target.modsDir, enabled ? file : `${file}.disabled`)
  const relativePath = relative(resolve(target.modsDir), resolve(source))
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) throw new Error('Ruta de mod no válida')
  if (!existsSync(source)) throw new Error('No se encontró el archivo del mod')
  if (existsSync(destination)) throw new Error('Ya existe el destino del mod; no se sobrescribió ningún archivo')
  await fs.rename(source, destination)
  return listInstalledContent('mod')
}

export async function removeContent(
  kind: ContentKind,
  projectId: string
): Promise<InstalledContent[]> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(projectId)) throw new Error('Proyecto no válido')

  const target = await getLibraryTarget()
  const directory = kind === 'mod' ? target.modsDir : target.resourcepacksDir
  const data = await readLibrary(target.instanceDir)
  const map = contentMap(data, kind)
  const item = map[projectId]
  if (!item) throw new Error('El recurso no está instalado en este perfil')

  await fs.rm(safeRemove(directory, item.file), { force: true }).catch(() => undefined)
  if (kind === 'mod') {
    await fs.rm(safeRemove(directory, `${item.file}.disabled`), { force: true }).catch(() => undefined)
  }
  delete map[projectId]
  await writeLibrary(target.instanceDir, data)
  return listInstalledContent(kind)
}

export async function getContentFolder(kind: ContentKind): Promise<string> {
  const target = await getLibraryTarget()
  const directory = kind === 'mod' ? target.modsDir : target.resourcepacksDir
  await fs.mkdir(directory, { recursive: true })
  return directory
}
