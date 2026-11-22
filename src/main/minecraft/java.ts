import { spawn } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { JavaInfo } from '../../shared/types'

const JAVA_CACHE_MS = 5 * 60_000
let cachedJava: JavaInfo[] | null = null
let cacheExpiresAt = 0
let scanInFlight: Promise<JavaInfo[]> | null = null

function parseMajor(version: string): number | null {
  const match = version.match(/(\d+)(?:\.(\d+))?/)
  if (!match) return null
  if (match[1] === '1' && match[2]) return Number(match[2])
  return Number(match[1])
}

export function getJavaVersion(javaPath: string): Promise<number | null> {
  return readJavaVersion(javaPath)
}

function readJavaVersion(javaPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(javaPath, ['-version'], { windowsHide: true })
    let output = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve(null)
    }, 6000)

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
    child.on('close', () => {
      clearTimeout(timer)
      const match = output.match(/version "([^"]+)"/)
      resolve(match ? parseMajor(match[1]) : null)
    })
  })
}

async function globJavaDirs(base: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(base, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => join(base, entry.name, 'bin', 'java.exe'))
  } catch {
    return []
  }
}

async function candidates(): Promise<string[]> {
  const paths = new Set<string>()
  const exe = process.platform === 'win32' ? 'java.exe' : 'java'

  if (process.env.JAVA_HOME) {
    paths.add(join(process.env.JAVA_HOME, 'bin', exe))
  }

  for (const dir of (process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':')) {
    if (dir) paths.add(join(dir, exe))
  }

  if (process.platform === 'win32') {
    const bases = [
      'C:\\Program Files\\Java',
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Microsoft',
      'C:\\Program Files\\BellSoft',
      'C:\\Program Files\\Zulu',
      join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Eclipse Adoptium')
    ]

    for (const base of bases) {
      if (!base) continue
      for (const path of await globJavaDirs(base)) paths.add(path)
    }
  } else if (process.platform === 'darwin') {
    for (const path of await globJavaDirs('/Library/Java/JavaVirtualMachines')) paths.add(path)
  } else {
    for (const path of await globJavaDirs('/usr/lib/jvm')) paths.add(path)
  }

  return [...paths].filter((path) => existsSync(path))
}

async function scanJava(): Promise<JavaInfo[]> {
  const paths = await candidates()
  const found: JavaInfo[] = []
  let next = 0
  const workerCount = Math.min(4, paths.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (next < paths.length) {
        const path = paths[next++]
        const major = await readJavaVersion(path)
        if (major !== null) found.push({ path, major })
      }
    })
  )

  return found.sort((a, b) => (b.major ?? 0) - (a.major ?? 0))
}

async function allJava(force = false): Promise<JavaInfo[]> {
  if (!force && cachedJava && Date.now() < cacheExpiresAt) return cachedJava
  if (!force && scanInFlight) return scanInFlight

  const scan = scanJava()
  scanInFlight = scan
  try {
    cachedJava = await scan
    cacheExpiresAt = Date.now() + JAVA_CACHE_MS
    return cachedJava
  } finally {
    if (scanInFlight === scan) scanInFlight = null
  }
}

export async function detectJava(
  requiredMajor?: number,
  preferred?: string,
  force = false
): Promise<JavaInfo[]> {
  const list = [...(await allJava(force))]
  const preferredPath = preferred?.trim()
  if (preferredPath && existsSync(preferredPath) && !list.some((java) => java.path === preferredPath)) {
    const major = await readJavaVersion(preferredPath)
    if (major !== null) list.push({ path: preferredPath, major })
  }
  list.sort((a, b) => (b.major ?? 0) - (a.major ?? 0))

  if (requiredMajor) {
    const preferredMatch = preferred ? list.find((java) => java.path === preferred.trim() && (java.major ?? 0) >= requiredMajor) : undefined
    if (preferredMatch) return [preferredMatch, ...list.filter((java) => java !== preferredMatch)]
    const compatible = list.filter((java) => (java.major ?? 0) >= requiredMajor)
    const incompatible = list.filter((java) => (java.major ?? 0) < requiredMajor)
    return [...compatible, ...incompatible]
  }

  return list
}

export async function pickJava(requiredMajor?: number): Promise<JavaInfo> {
  const list = await detectJava(requiredMajor)

  if (list.length === 0) {
    throw new Error('No se encontró Java instalado. Instala Java 21 o superior y vuelve a intentarlo.')
  }

  return list[0]
}
