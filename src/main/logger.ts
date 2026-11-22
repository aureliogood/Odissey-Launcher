import { appendFile, mkdir, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'

let logFile: string | null = null
let writeQueue: Promise<void> = Promise.resolve()

export async function initLogger(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true })
  logFile = join(directory, 'launcher.log')

  try {
    const info = await stat(logFile)
    if (info.size > 2 * 1024 * 1024) {
      await rename(logFile, join(directory, 'launcher.previous.log')).catch(() => undefined)
    }
  } catch {
    // Primera ejecución
  }
}

export function getLogFile(): string {
  return logFile ?? ''
}

export function log(level: 'info' | 'warn' | 'error', message: string): void {
  if (!logFile) return
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message.replace(/[\r\n]+/g, ' ')}\n`
  writeQueue = writeQueue
    .then(() => appendFile(logFile as string, line, 'utf8'))
    .catch(() => undefined)
}

export function logError(message: string, error: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  log('error', `${message} - ${detail}`)
}
