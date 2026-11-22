import { promises as fs } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { ContentKind, InstalledContent } from '../../shared/types'
import { getDatabase } from '../database'

export interface LibraryData {
  version: 1
  mods: Record<string, InstalledContent>
  resourcepacks: Record<string, InstalledContent>
}

function emptyData(): LibraryData {
  return { version: 1, mods: {}, resourcepacks: {} }
}

export function libraryFile(instanceDir: string): string {
  return join(instanceDir, '.odissey', 'library.json')
}

async function readLegacyLibrary(instanceDir: string): Promise<LibraryData> {
  try {
    const parsed = JSON.parse(await fs.readFile(libraryFile(instanceDir), 'utf8')) as LibraryData
    if (!parsed || typeof parsed !== 'object') return emptyData()
    return {
      version: 1,
      mods: parsed.mods && typeof parsed.mods === 'object' ? parsed.mods : {},
      resourcepacks:
        parsed.resourcepacks && typeof parsed.resourcepacks === 'object'
          ? parsed.resourcepacks
          : {}
    }
  } catch {
    return emptyData()
  }
}

export async function readLibrary(instanceDir: string): Promise<LibraryData> {
  const key = resolve(instanceDir)
  const db = getDatabase()
  const rows = db
    .prepare('SELECT kind, payload FROM library_items WHERE instance_dir = ?')
    .all(key) as Array<{ kind?: string; payload?: string }>

  if (rows.length === 0) {
    const legacy = await readLegacyLibrary(instanceDir)
    if (
      Object.keys(legacy.mods).length > 0 ||
      Object.keys(legacy.resourcepacks).length > 0
    ) {
      await writeLibrary(instanceDir, legacy)
      return legacy
    }
  }

  const data = emptyData()
  for (const row of rows) {
    if (row.kind !== 'mod' && row.kind !== 'resourcepack') continue
    try {
      const content = JSON.parse(row.payload ?? '') as InstalledContent
      if (!content || typeof content !== 'object') continue
      if (row.kind === 'mod') {
        data.mods[content.projectId] = content
      } else {
        data.resourcepacks[content.projectId] = content
      }
    } catch {
      continue
    }
  }
  return data
}

export async function writeLibrary(instanceDir: string, data: LibraryData): Promise<void> {
  const key = resolve(instanceDir)
  const db = getDatabase()
  const updatedAt = new Date().toISOString()

  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('DELETE FROM library_items WHERE instance_dir = ?').run(key)
    const insert = db.prepare(
      `INSERT INTO library_items (instance_dir, kind, project_id, payload, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    for (const [projectId, content] of Object.entries(data.mods)) {
      insert.run(key, 'mod', projectId, JSON.stringify(content), updatedAt)
    }
    for (const [projectId, content] of Object.entries(data.resourcepacks)) {
      insert.run(key, 'resourcepack', projectId, JSON.stringify(content), updatedAt)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  const file = libraryFile(instanceDir)
  await fs.mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  await fs.writeFile(temp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(temp, file)
}

export function contentMap(data: LibraryData, kind: ContentKind): Record<string, InstalledContent> {
  return kind === 'mod' ? data.mods : data.resourcepacks
}
