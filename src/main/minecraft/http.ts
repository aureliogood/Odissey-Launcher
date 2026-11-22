import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, promises as fs } from 'node:fs'
import { basename, dirname } from 'node:path'
import { once } from 'node:events'
import { pipeline } from 'node:stream/promises'

const USER_AGENT = 'OdisseyClient/1.0.0 (Minecraft launcher)'

interface VerifiedEntry {
  size: number
  mtimeMs: number
  sha1: string
}

const verified = new Map<string, VerifiedEntry>()
let verificationFile: string | null = null
let verificationDirty = false

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function abortError(): Error {
  return new Error('Operación cancelada')
}

export async function initVerificationCache(file: string): Promise<void> {
  verificationFile = file
  verified.clear()
  verificationDirty = false

  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, VerifiedEntry>
    for (const [key, value] of Object.entries(parsed)) {
      if (
        value &&
        typeof value.sha1 === 'string' &&
        typeof value.size === 'number' &&
        typeof value.mtimeMs === 'number'
      ) {
        verified.set(key, value)
      }
    }
  } catch {
    // Sin caché previa
  }
}

export async function flushVerificationCache(): Promise<void> {
  if (!verificationFile || !verificationDirty) return

  const payload = JSON.stringify(Object.fromEntries(verified))
  const temp = `${verificationFile}.${process.pid}.tmp`
  await fs.mkdir(dirname(verificationFile), { recursive: true })
  await fs.writeFile(temp, payload, 'utf8')
  await fs.rename(temp, verificationFile)
  verificationDirty = false
}

function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1')
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function recordVerified(path: string, stat: { size: number; mtimeMs: number }, sha1: string): void {
  verified.set(path, { size: stat.size, mtimeMs: stat.mtimeMs, sha1 })
  verificationDirty = true
}

async function request(
  url: string,
  signal?: AbortSignal,
  headers?: Record<string, string>
): Promise<Response> {
  if (signal?.aborted) throw abortError()
  const response = await fetch(url, {
    signal,
    headers: { 'User-Agent': USER_AGENT, ...headers }
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} al descargar ${url}`)
  }
  return response
}

export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await request(url, signal)
      return (await response.json()) as T
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error
      await delay(attempt * 700)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`No se pudo obtener ${url}`)
}

export interface ConditionalJson<T> {
  data: T | null
  notModified: boolean
  etag?: string
}

export async function fetchJsonConditional<T>(
  url: string,
  etag: string | undefined,
  signal?: AbortSignal
): Promise<ConditionalJson<T>> {
  try {
    const response = await fetch(url, {
      signal,
      headers: {
        'User-Agent': USER_AGENT,
        ...(etag ? { 'If-None-Match': etag } : {})
      }
    })

    if (response.status === 304) {
      return { data: null, notModified: true, etag }
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    return {
      data: (await response.json()) as T,
      notModified: false,
      etag: response.headers.get('etag') ?? undefined
    }
  } catch (error) {
    if (signal?.aborted) throw error
    throw error
  }
}

export interface DownloadOptions {
  url: string
  dest: string
  sha1?: string
  size?: number
  signal?: AbortSignal
  onBytes?: (bytes: number) => void
  onReset?: () => void
}

export async function downloadFile(options: DownloadOptions): Promise<'skipped' | 'downloaded'> {
  const { url, dest, sha1, size, signal } = options

  const existing = await fs.stat(dest).catch(() => null)

  if (existing) {
    if (size && existing.size !== size) {
      await fs.rm(dest, { force: true })
    } else if (sha1) {
      const cached = verified.get(dest)
      if (
        cached &&
        cached.size === existing.size &&
        cached.mtimeMs === existing.mtimeMs &&
        cached.sha1 === sha1
      ) {
        options.onBytes?.(existing.size)
        return 'skipped'
      }

      const actual = await hashFile(dest)
      if (actual === sha1) {
        recordVerified(dest, existing, sha1)
        options.onBytes?.(existing.size)
        return 'skipped'
      }

      await fs.rm(dest, { force: true })
    } else {
      options.onBytes?.(existing.size)
      return 'skipped'
    }
  }

  await fs.mkdir(dirname(dest), { recursive: true })
  const temp = `${dest}.part`
  let lastError: unknown

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    if (signal?.aborted) throw abortError()
    options.onReset?.()
    let discardPartial = false

    try {
      const partial = await fs.stat(temp).catch(() => null)
      let resumeAt = partial && partial.size > 0 ? partial.size : 0
      if (size && resumeAt >= size) {
        await fs.rm(temp, { force: true })
        resumeAt = 0
      }

      let response = await request(
        url,
        signal,
        resumeAt > 0 ? { Range: `bytes=${resumeAt}-` } : undefined
      )
      let append = resumeAt > 0 && response.status === 206
      if (append) {
        const contentRange = response.headers.get('content-range')
        const start = contentRange?.match(/^bytes (\d+)-/)?.[1]
        if (start !== undefined && Number(start) !== resumeAt) {
          discardPartial = true
          await fs.rm(temp, { force: true })
          append = false
          resumeAt = 0
          response = await request(url, signal)
        }
      } else if (response.status === 200 && resumeAt > 0) {
        resumeAt = 0
        await fs.rm(temp, { force: true })
      }

      if (!response.body) throw new Error('Respuesta sin contenido')

      const stream = createWriteStream(temp, { flags: append ? 'a' : 'w' })
      const hash = sha1 && !append ? createHash('sha1') : null
      const reader = response.body.getReader()
      let received = resumeAt

      if (append) options.onBytes?.(resumeAt)

      try {
        for (;;) {
          if (signal?.aborted) throw abortError()
          const { done, value } = await reader.read()
          if (done) break
          const chunk = Buffer.from(value)
          received += chunk.byteLength
          hash?.update(chunk)
          options.onBytes?.(chunk.byteLength)
          if (!stream.write(chunk)) await once(stream, 'drain')
        }
        await new Promise<void>((resolve, reject) => {
          stream.end((error?: Error | null) => (error ? reject(error) : resolve()))
        })
      } catch (error) {
        stream.destroy()
        throw error
      }

      if (size && received !== size) {
        discardPartial = true
        throw new Error('El archivo descargado está incompleto')
      }

      if (sha1) {
        const actual = hash ? hash.digest('hex') : await hashFile(temp)
        if (actual !== sha1) {
          discardPartial = true
          throw new Error('El archivo descargado está corrupto (SHA1 no coincide)')
        }
      }

      await fs.rename(temp, dest)
      const stat = await fs.stat(dest)
      if (sha1) {
        recordVerified(dest, stat, sha1)
      } else {
        verified.delete(dest)
      }
      return 'downloaded'
    } catch (error) {
      lastError = error
      if (error instanceof Error && error.message.startsWith('HTTP 416')) {
        discardPartial = true
      }
      if (discardPartial || signal?.aborted) {
        await fs.rm(temp, { force: true }).catch(() => undefined)
      }
      if (signal?.aborted) throw error
      await delay(attempt * 700)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`No se pudo descargar ${url}`)
}

export interface DownloadTask {
  url: string
  dest: string
  sha1?: string
  size?: number
}

export type DownloadProgress = (
  doneBytes: number,
  totalBytes: number,
  doneCount: number,
  totalCount: number
) => void

export interface DownloadDetail {
  currentFile: string | null
  doneCount: number
  totalCount: number
}

export async function downloadAll(
  tasks: DownloadTask[],
  concurrency: number,
  signal?: AbortSignal,
  onProgress?: DownloadProgress,
  onDetail?: (detail: DownloadDetail) => void
): Promise<void> {
  if (tasks.length === 0) return

  const totalBytes = tasks.reduce((sum, task) => sum + (task.size ?? 0), 0)
  let doneBytes = 0
  let doneCount = 0
  let next = 0
  const activeFiles = new Set<string>()

  const report = (): void => {
    const last = [...activeFiles].pop() ?? null
    onDetail?.({
      currentFile: last,
      doneCount,
      totalCount: tasks.length
    })
    onProgress?.(doneBytes, totalBytes, doneCount, tasks.length)
  }

  const worker = async (): Promise<void> => {
    for (;;) {
      if (signal?.aborted) throw abortError()
      const index = next
      next += 1
      if (index >= tasks.length) return

      const task = tasks[index]
      let received = 0
      const fileName = basename(task.dest)
      activeFiles.add(fileName)
      report()

      try {
        await downloadFile({
          ...task,
          signal,
          onReset: () => {
            doneBytes = Math.max(0, doneBytes - received)
            received = 0
            report()
          },
          onBytes: (bytes) => {
            if (task.size) {
              const room = task.size - received
              const accepted = Math.max(0, Math.min(bytes, room))
              received += accepted
              doneBytes += accepted
            } else {
              received += bytes
              doneBytes += bytes
            }
            report()
          }
        })
      } catch (error) {
        if (task.size) {
          doneBytes = Math.max(0, doneBytes - received)
        }
        throw error
      } finally {
        activeFiles.delete(fileName)
      }

      doneCount += 1
      report()
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  )
}

export async function copyFileIfMissing(source: string, target: string): Promise<void> {
  if (existsSync(target)) return
  await fs.mkdir(dirname(target), { recursive: true })
  await pipeline(createReadStream(source), createWriteStream(target))
}
