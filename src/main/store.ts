import { app } from 'electron'
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { totalmem } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { Settings } from '../shared/types'
import { readSetting, writeSetting } from './database'

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function maxRamMb(): number {
  const totalMb = Math.floor(totalmem() / 1024 / 1024)
  return Math.min(32768, Math.max(1024, Math.floor(totalMb * 0.8)))
}

function defaults(): Settings {
  // Calcular RAM por defecto según el sistema: 50% de la RAM total,
  // con un mínimo de 2 GB y un máximo de 4 GB para el valor inicial.
  const totalMb = Math.floor(totalmem() / 1024 / 1024)
  const defaultRam = Math.min(4096, Math.max(2048, Math.floor(totalMb * 0.5 / 512) * 512))
  return {
    ramMb: defaultRam,
    javaPath: '',
    gameDir: join(app.getPath('userData'), 'minecraft'),
    selectedVersion: '',
    showSnapshots: false,
    customResolution: false,
    resolutionWidth: 1280,
    resolutionHeight: 720,
    extraJvmArgs: '',
    checkUpdatesOnStart: true,
    minimizeToTrayOnGameStart: false,
    autoCloseLauncherOnGameStart: false,
    highPriorityGame: false,
    cleanLogsOnLaunch: false
  }
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function sanitize(settings: Settings): Settings {
  const base = defaults()
  const extra = typeof settings.extraJvmArgs === 'string' ? settings.extraJvmArgs : ''
  return {
    ramMb: clamp(Number(settings.ramMb), 1024, maxRamMb(), base.ramMb),
    javaPath: typeof settings.javaPath === 'string' ? settings.javaPath.trim() : '',
    gameDir:
      typeof settings.gameDir === 'string' && settings.gameDir.trim()
        ? resolve(settings.gameDir)
        : base.gameDir,
    selectedVersion: typeof settings.selectedVersion === 'string' ? settings.selectedVersion : '',
    showSnapshots: Boolean(settings.showSnapshots),
    customResolution: Boolean(settings.customResolution),
    resolutionWidth: clamp(Number(settings.resolutionWidth), 320, 7680, base.resolutionWidth),
    resolutionHeight: clamp(Number(settings.resolutionHeight), 240, 4320, base.resolutionHeight),
    extraJvmArgs: extra.replace(/[\r\n]+/g, ' ').slice(0, 2000),
    checkUpdatesOnStart:
      settings.checkUpdatesOnStart === undefined
        ? base.checkUpdatesOnStart
        : Boolean(settings.checkUpdatesOnStart),
    minimizeToTrayOnGameStart: Boolean(settings.minimizeToTrayOnGameStart),
    autoCloseLauncherOnGameStart: Boolean(settings.autoCloseLauncherOnGameStart),
    highPriorityGame: Boolean(settings.highPriorityGame),
    cleanLogsOnLaunch: Boolean(settings.cleanLogsOnLaunch)
  }
}

async function readLegacySettings(): Promise<Partial<Settings> | null> {
  try {
    const raw = await readFile(settingsFile(), 'utf8')
    return JSON.parse(raw) as Partial<Settings>
  } catch {
    return null
  }
}

async function mirrorSettings(settings: Settings): Promise<void> {
  const file = settingsFile()
  await mkdir(dirname(file), { recursive: true })
  await copyFile(file, `${file}.bak`).catch(() => undefined)
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(settings, null, 2), 'utf8')
  await rename(temp, file)
}

export async function loadSettings(): Promise<Settings> {
  const stored = readSetting<Partial<Settings>>('app')
  if (stored) {
    return sanitize({ ...defaults(), ...stored } as Settings)
  }

  const legacy = await readLegacySettings()
  const settings = sanitize({ ...defaults(), ...(legacy ?? {}) } as Settings)
  writeSetting('app', settings)
  return settings
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = sanitize({ ...(await loadSettings()), ...patch })
  writeSetting('app', next)
  await mirrorSettings(next).catch(() => undefined)
  return next
}
