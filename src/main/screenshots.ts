import { ClipboardItem as ElectronClipboardItem, clipboard, nativeImage, shell } from 'electron'
import { mkdir, readFile, readdir, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import type { ScreenshotItem } from '../shared/types'
import { readInstalledMarker } from './minecraft/launch'
import { loadSettings } from './store'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])
const MAX_SCREENSHOTS = 60
const MAX_IMAGE_BYTES = 40 * 1024 * 1024

async function screenshotDirectory(): Promise<string> {
  const settings = await loadSettings()
  const marker = settings.selectedVersion
    ? await readInstalledMarker(settings.gameDir, settings.selectedVersion)
    : null
  const instanceDir = marker?.kind === 'fabric' && settings.selectedVersion
    ? join(settings.gameDir, 'instances', settings.selectedVersion)
    : settings.gameDir
  return join(instanceDir, 'screenshots')
}

function validateTarget(directory: string, target: string): string {
  if (typeof target !== 'string' || target.length > 2048) throw new Error('Ruta de captura no válida')
  const full = resolve(target)
  const rel = relative(resolve(directory), full)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || !IMAGE_EXTENSIONS.has(extname(full).toLowerCase())) {
    throw new Error('La captura seleccionada está fuera de la carpeta del juego')
  }
  return full
}

export async function listScreenshots(): Promise<ScreenshotItem[]> {
  const directory = await screenshotDirectory()
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const candidates = (await Promise.all(
    entries
      .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase()))
      .map(async (entry) => {
        const path = join(directory, entry.name)
        try {
          const metadata = await stat(path)
          if (metadata.size <= 0 || metadata.size > MAX_IMAGE_BYTES) return null
          return {
            name: entry.name,
            path,
            modifiedAt: metadata.mtime.toISOString(),
            modifiedAtMs: metadata.mtimeMs,
            sizeBytes: metadata.size
          }
        } catch {
          return null
        }
      })
  ))
  const recent = candidates
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.modifiedAtMs - a.modifiedAtMs)
    .slice(0, MAX_SCREENSHOTS)
  const files: ScreenshotItem[] = []
  for (const candidate of recent) {
    try {
      const image = nativeImage.createFromPath(candidate.path)
      if (image.isEmpty()) continue
      const resized = image.resize({ width: 400, height: 250, quality: 'good' })
      files.push({
        name: candidate.name,
        path: candidate.path,
        modifiedAt: candidate.modifiedAt,
        sizeBytes: candidate.sizeBytes,
        thumbnail: `data:image/jpeg;base64,${resized.toJPEG(68).toString('base64')}`
      })
    } catch {
      // Omite capturas que no se puedan decodificar.
    }
  }
  return files
}

export async function openScreenshotFolder(): Promise<void> {
  const directory = await screenshotDirectory()
  await mkdir(directory, { recursive: true })
  const error = await shell.openPath(directory)
  if (error) throw new Error(error)
}

export async function openScreenshot(target: string): Promise<void> {
  const path = validateTarget(await screenshotDirectory(), target)
  const error = await shell.openPath(path)
  if (error) throw new Error(error)
}

export async function getScreenshotData(target: string): Promise<string> {
  const path = validateTarget(await screenshotDirectory(), target)
  const metadata = await stat(path)
  if (metadata.size <= 0 || metadata.size > MAX_IMAGE_BYTES) {
    throw new Error('La captura supera el tamaño permitido')
  }
  const mime = extname(path).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg'
  return `data:${mime};base64,${(await readFile(path)).toString('base64')}`
}

export async function deleteScreenshot(target: string): Promise<void> {
  const path = validateTarget(await screenshotDirectory(), target)
  await shell.trashItem(path)
}

export async function copyScreenshot(target: string): Promise<void> {
  const path = validateTarget(await screenshotDirectory(), target)
  const image = nativeImage.createFromPath(path)
  if (image.isEmpty()) throw new Error('No se pudo abrir la captura')
  const png = Uint8Array.from(image.toPNG())
  await clipboard.write([new ElectronClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })])
}

