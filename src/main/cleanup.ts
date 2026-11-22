import { shell } from 'electron'
import { readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { readInstalledMarker } from './minecraft/launch'
import { loadSettings } from './store'

const RETENTION_DAYS = 30
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000

export async function cleanupOldLogs(): Promise<{ deletedFiles: number; deletedBytes: number }> {
  const settings = await loadSettings()
  const marker = settings.selectedVersion
    ? await readInstalledMarker(settings.gameDir, settings.selectedVersion)
    : null
  const instanceDir = marker?.kind === 'fabric' && settings.selectedVersion
    ? join(settings.gameDir, 'instances', settings.selectedVersion)
    : settings.gameDir
  const directories = new Set([
    join(settings.gameDir, 'logs'),
    join(settings.gameDir, 'crash-reports'),
    join(instanceDir, 'logs'),
    join(instanceDir, 'crash-reports')
  ])
  const cutoff = Date.now() - RETENTION_MS
  let deletedFiles = 0
  let deletedBytes = 0
  for (const directory of directories) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.toLowerCase() === 'latest.log') continue
      const extension = extname(entry.name).toLowerCase()
      const isRotatedLog = directory.endsWith('logs') && extension === '.gz'
      const isCrashReport = directory.endsWith('crash-reports') && extension === '.txt'
      if (!isRotatedLog && !isCrashReport) continue
      const file = join(directory, entry.name)
      try {
        const metadata = await stat(file)
        if (metadata.mtimeMs > cutoff) continue
        await shell.trashItem(file)
        deletedFiles += 1
        deletedBytes += metadata.size
      } catch {
        // Un archivo bloqueado o no disponible no detiene la limpieza del resto.
      }
    }
  }
  const tempDirectory = join(settings.gameDir, '.odissey')
  const staleTemps = await readdir(tempDirectory, { withFileTypes: true }).catch(() => [])
  const tempCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  for (const entry of staleTemps) {
    if (!entry.isFile() || !/\.(?:tmp|part)$/i.test(entry.name)) continue
    const file = join(tempDirectory, entry.name)
    try {
      const metadata = await stat(file)
      if (metadata.mtimeMs > tempCutoff) continue
      await shell.trashItem(file)
      deletedFiles += 1
      deletedBytes += metadata.size
    } catch {
      // Mantiene la limpieza parcial si algún temporal está bloqueado.
    }
  }
  return { deletedFiles, deletedBytes }
}
