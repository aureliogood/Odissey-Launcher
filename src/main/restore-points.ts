import AdmZip from 'adm-zip'
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { RestorePoint, Settings } from '../shared/types'
import { readInstalledMarker } from './minecraft/launch'
import { loadSettings } from './store'
import { log } from './logger'

const BACKUP_DIR = '.odissey/restore-points'
const CONFIG_ROOTS = ['options.txt', 'servers.dat', 'config', 'mods', 'resourcepacks', 'shaderpacks'] as const
const WORLD_ROOT = 'saves'
const MAX_BACKUP_BYTES = 1024 * 1024 * 1024
const MAX_POINTS = 6

interface RestoreManifest {
  format: 'odissey-restore-point'
  version: 1
  createdAt: string
  includesWorlds: boolean
  roots: string[]
  present: string[]
}

async function activeInstance(settings: Settings): Promise<string> {
  const marker = settings.selectedVersion
    ? await readInstalledMarker(settings.gameDir, settings.selectedVersion)
    : null
  return marker?.kind === 'fabric' && settings.selectedVersion
    ? join(settings.gameDir, 'instances', settings.selectedVersion)
    : settings.gameDir
}

async function directorySize(path: string): Promise<number> {
  const entries = await fs.readdir(path, { withFileTypes: true }).catch(() => null)
  if (!entries) return 0
  let total = 0
  for (const entry of entries) {
    const child = join(path, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) total += await directorySize(child)
    else if (entry.isFile()) total += (await fs.stat(child).catch(() => null))?.size ?? 0
    if (total > MAX_BACKUP_BYTES) break
  }
  return total
}

function pointFolder(instanceDir: string): string {
  return join(instanceDir, BACKUP_DIR)
}

function validRoot(root: string): boolean {
  return (CONFIG_ROOTS as readonly string[]).includes(root) || root === WORLD_ROOT
}

export async function createRestorePoint(includeWorlds = false): Promise<RestorePoint> {
  const settings = await loadSettings()
  const instanceDir = await activeInstance(settings)
  const folder = pointFolder(instanceDir)
  await fs.mkdir(folder, { recursive: true })

  const roots = includeWorlds ? [...CONFIG_ROOTS, WORLD_ROOT] : [...CONFIG_ROOTS]
  const present: string[] = []
  let estimatedBytes = 0
  for (const root of roots) {
    const path = join(instanceDir, root)
    const stat = await fs.lstat(path).catch(() => null)
    if (!stat || stat.isSymbolicLink()) continue
    present.push(root)
    estimatedBytes += stat.isDirectory() ? await directorySize(path) : stat.size
  }
  if (estimatedBytes > MAX_BACKUP_BYTES) {
    throw new Error('El punto de restauración superaría 1 GB. Desmarca Incluir mundos o libera espacio y vuelve a intentarlo.')
  }

  const createdAt = new Date().toISOString()
  const id = `restore-${createdAt.replace(/[-:.]/g, '').replace('Z', 'Z')}-${randomUUID().slice(0, 8)}.zip`
  const output = join(folder, id)
  const zip = new AdmZip()
  for (const root of present) {
    const source = join(instanceDir, root)
    const stat = await fs.stat(source)
    if (stat.isDirectory()) {
      await zip.addLocalFolderPromise(source, { zipPath: root })
    } else {
      zip.addLocalFile(source, dirname(root) === '.' ? '' : dirname(root), root.split(/[\\/]/).pop())
    }
  }
  const manifest: RestoreManifest = {
    format: 'odissey-restore-point',
    version: 1,
    createdAt,
    includesWorlds: includeWorlds,
    roots,
    present
  }
  zip.addFile('restore-point.json', Buffer.from(JSON.stringify(manifest), 'utf8'))
  await zip.writeZipPromise(output, { overwrite: false })

  const info = await fs.stat(output)
  const points = await listRestorePointsForFolder(folder)
  for (const old of points.slice(MAX_POINTS)) await fs.rm(join(folder, old.id), { force: true }).catch(() => undefined)
  const point = { id, createdAt, sizeBytes: info.size, includesWorlds: includeWorlds }
  log('info', `Punto de restauración creado: ${id} (${info.size} bytes)`)
  return point
}

async function listRestorePointsForFolder(folder: string): Promise<RestorePoint[]> {
  const entries = await fs.readdir(folder, { withFileTypes: true }).catch(() => [])
  const items: RestorePoint[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !/^restore-[A-Za-z0-9TZ-]+\.zip$/.test(entry.name)) continue
    const path = join(folder, entry.name)
    try {
      const zip = new AdmZip(path)
      const entryData = zip.getEntry('restore-point.json')
      if (!entryData) continue
      const manifest = JSON.parse(entryData.getData().toString('utf8')) as Partial<RestoreManifest>
      if (manifest.format !== 'odissey-restore-point' || manifest.version !== 1 || typeof manifest.createdAt !== 'string') continue
      const info = await fs.stat(path)
      items.push({ id: entry.name, createdAt: manifest.createdAt, sizeBytes: info.size, includesWorlds: manifest.includesWorlds === true })
    } catch {
      // Omitir puntos incompletos o dañados de la lista restaurable.
    }
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function listRestorePoints(): Promise<RestorePoint[]> {
  const settings = await loadSettings()
  return listRestorePointsForFolder(pointFolder(await activeInstance(settings)))
}

function isInside(root: string, target: string): boolean {
  const relativePath = relative(resolve(root), resolve(target))
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

export async function restoreRestorePoint(id: string): Promise<void> {
  if (!/^restore-[A-Za-z0-9TZ-]+\.zip$/.test(id)) throw new Error('Punto de restauración no válido')
  const settings = await loadSettings()
  const instanceDir = await activeInstance(settings)
  const folder = pointFolder(instanceDir)
  const archivePath = join(folder, id)
  if (!isInside(folder, archivePath)) throw new Error('Ruta de restauración no válida')
  const points = await listRestorePointsForFolder(folder)
  if (!points.some((point) => point.id === id)) throw new Error('No se encontró un punto válido')

  const zip = new AdmZip(archivePath)

  // Capturar el estado actual primero, sin incluir worlds, para poder deshacer una restauración incorrecta.
  await createRestorePoint(false)
  const manifestEntry = zip.getEntry('restore-point.json')
  if (!manifestEntry) throw new Error('El punto no contiene su manifiesto')
  const manifest = JSON.parse(manifestEntry.getData().toString('utf8')) as RestoreManifest
  if (
    manifest.format !== 'odissey-restore-point' ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.roots) ||
    !Array.isArray(manifest.present) ||
    manifest.roots.some((root) => !validRoot(root)) ||
    manifest.present.some((root) => !manifest.roots.includes(root))
  ) throw new Error('El manifiesto del punto está dañado o no es compatible')

  for (const entry of zip.getEntries()) {
    const entryName = entry.entryName.replace(/\\/g, '/')
    if (entryName.startsWith('/') || entryName.split('/').some((segment) => segment === '..')) {
      throw new Error('El punto contiene una ruta no segura')
    }
    if (entryName === 'restore-point.json') continue
    if (!manifest.roots.some((root) => entryName === root || entryName.startsWith(`${root}/`))) {
      throw new Error('El punto contiene archivos fuera de las rutas permitidas')
    }
  }

  const staging = join(app.getPath('temp'), `odyssey-restore-${randomUUID()}`)
  await fs.mkdir(staging, { recursive: true })
  try {
    await zip.extractAllToAsync(staging, true)
    for (const root of manifest.roots) {
      const destination = join(instanceDir, root)
      if (!isInside(instanceDir, destination)) throw new Error('Destino de restauración no válido')
      await fs.rm(destination, { recursive: true, force: true })
      if (manifest.present.includes(root)) {
        await fs.mkdir(dirname(destination), { recursive: true })
        await fs.cp(join(staging, root), destination, { recursive: true, force: true })
      }
    }
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined)
  }
  log('info', `Punto de restauración aplicado: ${id}`)
}
