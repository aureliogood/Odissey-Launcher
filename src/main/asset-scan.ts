import AdmZip from 'adm-zip'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { AssetScanResult } from '../shared/types'
import { readInstalledMarker } from './minecraft/launch'
import { loadSettings } from './store'

const MAX_FILES = 5000
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path)
    stream.on('data', (chunk: Buffer) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolve)
  })
  return hash.digest('hex')
}

async function listFiles(folder: string): Promise<string[]> {
  const result: string[] = []
  const pending = [folder]
  while (pending.length && result.length < MAX_FILES) {
    const current = pending.pop()!
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile()) result.push(path)
      if (result.length >= MAX_FILES) break
    }
  }
  return result
}

async function gameRoot(): Promise<string> {
  const settings = await loadSettings()
  if (!settings.selectedVersion) return settings.gameDir
  const marker = await readInstalledMarker(settings.gameDir, settings.selectedVersion)
  return marker?.kind === 'fabric'
    ? join(settings.gameDir, 'instances', settings.selectedVersion)
    : settings.gameDir
}

export async function scanGameAssets(): Promise<AssetScanResult> {
  const root = await gameRoot()
  const duplicates: AssetScanResult['duplicates'] = []
  const invalidArchives: AssetScanResult['invalidArchives'] = []
  let filesScanned = 0

  for (const kind of ['resourcepacks', 'shaderpacks']) {
    const files = await listFiles(join(root, kind))
    const byHash = new Map<string, string[]>()
    for (const file of files) {
      let info
      try {
        info = await stat(file)
      } catch {
        continue
      }
      if (info.size > MAX_FILE_BYTES) continue
      filesScanned += 1
      const hash = await hashFile(file)
      const matches = byHash.get(hash) ?? []
      matches.push(file)
      byHash.set(hash, matches)

      if (file.toLowerCase().endsWith('.zip')) {
        try {
          const zip = new AdmZip(file)
          if (zip.getEntries().length === 0) throw new Error('El ZIP está vacío')
          const failure = zip.test()
          if (failure !== true) throw new Error(String(failure || 'No se pudo verificar el ZIP'))
        } catch (error) {
          invalidArchives.push({
            file,
            reason: error instanceof Error ? error.message.slice(0, 240) : 'Archivo ZIP no válido'
          })
        }
      }
    }
    for (const [hash, matches] of byHash) {
      if (matches.length > 1) duplicates.push({ hash, files: matches })
    }
  }

  return { scannedAt: new Date().toISOString(), filesScanned, duplicates, invalidArchives }
}
