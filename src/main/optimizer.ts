import { app } from 'electron'
import { spawn } from 'node:child_process'
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { existsSync, promises as fs } from 'node:fs'
import { arch, cpus, freemem, totalmem } from 'node:os'
import { dirname, join } from 'node:path'
import type {
  OptimizerAnalysis,
  OptimizerApplyOptions,
  OptimizerBackupInfo,
  OptimizerHardware,
  OptimizerJava,
  OptimizerPatch,
  OptimizerRecommendation,
  Settings
} from '../shared/types'
import { detectJava } from './minecraft/java'
import { readInstalledMarker } from './minecraft/launch'
import { log, logError } from './logger'
import { loadSettings, maxRamMb, saveSettings } from './store'

const CACHE_MS = 60 * 1000
const HARDWARE_CACHE_MS = 5 * 60 * 1000
const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

interface BackupFile {
  backupAt: string
  previous: Pick<Settings, 'ramMb' | 'javaPath' | 'extraJvmArgs'>
}

let hardwareCache: { at: number; value: OptimizerHardware } | null = null
let analysisCache: { at: number; signature: string; value: OptimizerAnalysis } | null = null
let gpuPending: Promise<string | null> | null = null

function backupFile(): string {
  return join(app.getPath('userData'), 'optimizer-backup.json')
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(data, null, 2), 'utf8')
  await rename(temp, path)
}

async function readBackup(): Promise<BackupFile | null> {
  const backup = await readJson<BackupFile>(backupFile())
  if (!backup || typeof backup.backupAt !== 'string' || !backup.previous) return null
  return backup
}

async function writeBackup(previous: Settings): Promise<string> {
  const data: BackupFile = {
    backupAt: new Date().toISOString(),
    previous: {
      ramMb: previous.ramMb,
      javaPath: previous.javaPath,
      extraJvmArgs: previous.extraJvmArgs
    }
  }
  await writeJsonAtomic(backupFile(), data)
  return data.backupAt
}

async function queryGpu(): Promise<string | null> {
  if (process.platform !== 'win32') return null
  if (gpuPending) return gpuPending

  gpuPending = new Promise<string | null>((resolve) => {
    let settled = false
    const finish = (value: string | null): void => {
      if (settled) return
      settled = true
      resolve(value)
    }

    let child
    try {
      child = spawn(
        'powershell.exe',
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name'
        ],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
      )
    } catch {
      finish(null)
      return
    }

    let output = ''
    const timer = setTimeout(() => {
      child.kill()
      finish(null)
    }, 7000)

    child.stdout?.on('data', (chunk: Buffer) => {
      if (output.length < 4096) output += chunk.toString('utf8')
    })
    child.on('error', () => {
      clearTimeout(timer)
      finish(null)
    })
    child.on('close', () => {
      clearTimeout(timer)
      const names = [...new Set(output.split(/\r?\n/).map((name) => name.trim()).filter(Boolean))]
      finish(names.length ? names.map((name) => name.slice(0, 120)).join(' · ').slice(0, 360) : null)
    })
  }).finally(() => {
    gpuPending = null
  })

  return gpuPending
}

async function hardware(force = false): Promise<OptimizerHardware> {
  if (!force && hardwareCache && Date.now() - hardwareCache.at < HARDWARE_CACHE_MS) {
    return { ...hardwareCache.value, freeMemMb: Math.floor(freemem() / 1024 / 1024) }
  }

  const cpu = cpus()[0]
  const value: OptimizerHardware = {
    totalMemMb: Math.floor(totalmem() / 1024 / 1024),
    freeMemMb: Math.floor(freemem() / 1024 / 1024),
    platform: process.platform,
    arch: arch(),
    cpuModel: cpu?.model?.trim().replace(/\s+/g, ' ') ?? 'Desconocido',
    cpuCount: cpus().length,
    gpu: await queryGpu()
  }

  hardwareCache = { at: Date.now(), value }
  return value
}

interface VersionJavaInfo {
  javaVersion?: { majorVersion?: number }
  inheritsFrom?: string
}

async function requiredJavaMajor(root: string, baseVersion: string): Promise<number | null> {
  if (!VERSION_PATTERN.test(baseVersion)) return null
  const seen = new Set<string>()
  let current = baseVersion

  for (let depth = 0; depth < 5; depth += 1) {
    if (seen.has(current)) return null
    seen.add(current)
    const info = await readJson<VersionJavaInfo>(
      join(root, 'versions', current, `${current}.json`)
    )
    if (info?.javaVersion?.majorVersion && Number.isFinite(info.javaVersion.majorVersion)) {
      return info.javaVersion.majorVersion
    }
    if (!info?.inheritsFrom) return null
    current = info.inheritsFrom
  }

  return null
}

function roundRam(value: number): number {
  return Math.max(1024, Math.round(value / 512) * 512)
}

function recommendRam(
  hardwareInfo: OptimizerHardware,
  loader: 'vanilla' | 'fabric'
): number {
  const total = hardwareInfo.totalMemMb
  const base = loader === 'fabric' ? (total <= 8192 ? 4096 : total <= 12288 ? 5120 : 6144) : total <= 4096 ? 2048 : total <= 8192 ? 3072 : 4096
  const reserve = Math.max(2048, Math.round(total * 0.25))
  return Math.min(8192, maxRamMb(), roundRam(Math.min(base, total - reserve)))
}

function currentArgsRisky(args: string): boolean {
  if (!args.trim()) return false
  return /-Xm[sx]\b|-cp\b|-classpath\b|-jar\b|UseConcMarkSweepGC|UseSerialGC/i.test(args)
}

function currentJava(
  settings: Settings,
  detected: Awaited<ReturnType<typeof detectJava>>,
  requiredMajor: number | null
): OptimizerJava {
  const selected = settings.javaPath
    ? detected.find((java) => java.path === settings.javaPath)
    : null
  const compatibleList = detected
    .filter((java) => java.major !== null)
    .filter((java) => requiredMajor === null || (java.major ?? 0) >= requiredMajor)
    .sort((a, b) => (a.major ?? 0) - (b.major ?? 0))
  const recommended = requiredMajor === null ? null : (compatibleList[0] ?? null)

  const explicitMissing = Boolean(settings.javaPath) && !existsSync(settings.javaPath)
  const compatible =
    explicitMissing
      ? false
      : requiredMajor === null
        ? null
        : detected.length === 0
          ? false
          : selected && selected.major !== null
            ? selected.major >= requiredMajor
            : recommended !== null

  return {
    requiredMajor,
    selectedPath: settings.javaPath,
    selectedMajor: selected?.major ?? null,
    recommendedPath: recommended?.path ?? null,
    recommendedMajor: recommended?.major ?? null,
    compatible,
    detected
  }
}

function buildRecommendations(
  settings: Settings,
  hardwareInfo: OptimizerHardware,
  javaInfo: OptimizerJava,
  loader: 'vanilla' | 'fabric'
): { recommendations: OptimizerRecommendation[]; patch: OptimizerPatch; warnings: string[] } {
  const ram = recommendRam(hardwareInfo, loader)
  const jvm = ''
  const warnings: string[] = []
  const recommendations: OptimizerRecommendation[] = []

  const ramApplicable = settings.ramMb !== ram
  recommendations.push({
    id: 'ram',
    title: 'Memoria del juego',
    detail:
      'La recomendación reserva memoria para Windows, el launcher y otros procesos. No se asigna toda la RAM del equipo.',
    current: `${settings.ramMb} MB`,
    recommended: `${ram} MB`,
    applicable: ramApplicable,
    tone: ramApplicable ? 'info' : 'ok'
  })

  if (hardwareInfo.totalMemMb <= 8192 && loader === 'fabric') {
    warnings.push('Con 8 GB o menos, los perfiles con mods pueden quedarse sin memoria si abres otras aplicaciones.')
  }
  if (hardwareInfo.freeMemMb < ram + 1024) {
    warnings.push('La memoria disponible ahora mismo es baja. Cierra aplicaciones pesadas antes de jugar.')
  }

  const javaApplicable =
    javaInfo.recommendedPath !== null &&
    (settings.javaPath !== javaInfo.recommendedPath || javaInfo.compatible === false)
  recommendations.push({
    id: 'java',
    title: 'Java compatible',
    detail:
      javaInfo.requiredMajor === null
        ? 'No se pudo leer la versión de Java requerida desde los metadatos locales. Se muestra Java detectado sin inventar un requisito.'
        : `Esta instalación declara Java ${javaInfo.requiredMajor} o superior. Se elige la versión detectada más baja que cumple el requisito.`,
    current: settings.javaPath
      ? `Java ${javaInfo.selectedMajor ?? '?'}`
      : javaInfo.recommendedMajor
        ? `Automático · Java ${javaInfo.recommendedMajor}`
        : 'Automático',
    recommended: javaInfo.recommendedMajor
      ? `Java ${javaInfo.recommendedMajor}`
      : 'No disponible',
    applicable: javaApplicable,
    tone:
      javaInfo.compatible === false
        ? 'warn'
        : javaInfo.compatible === null
          ? 'info'
          : 'ok'
  })

  if (javaInfo.requiredMajor === null) {
    warnings.push(
      'No hay metadatos locales suficientes para saber qué Java requiere esta versión. No se cambiará Java automáticamente.'
    )
  }
  if (javaInfo.requiredMajor !== null && javaInfo.compatible === false) {
    warnings.push(
      `El Java seleccionado no cumple el requisito de Java ${javaInfo.requiredMajor}. Minecraft podría no iniciar.`
    )
  }
  if (javaInfo.detected.length === 0) {
    warnings.push('No se detectó ninguna instalación de Java. Instala Java 21 o superior.')
  }

  const riskyArgs = currentArgsRisky(settings.extraJvmArgs)
  const jvmApplicable = riskyArgs
  recommendations.push({
    id: 'jvm',
    title: 'Argumentos JVM',
    detail:
      'Solo se recomiendan argumentos estándar y seguros. No se prometen aumentos de FPS y no se añaden opciones experimentales.',
    current: riskyArgs ? 'Incluyen opciones de memoria/ruta no seguras' : settings.extraJvmArgs || 'Sin argumentos extra',
    recommended: riskyArgs ? jvm || 'Sin argumentos extra' : settings.extraJvmArgs || 'Sin argumentos extra',
    applicable: jvmApplicable,
    tone: riskyArgs ? 'warn' : 'ok'
  })

  if (riskyArgs) {
    warnings.push('Los argumentos JVM extra contienen -Xmx, -Xms o rutas que el launcher ya controla.')
  }

  return {
    recommendations,
    patch: {
      ramMb: ram,
      javaPath: javaInfo.recommendedPath ?? settings.javaPath,
      extraJvmArgs: riskyArgs ? jvm : settings.extraJvmArgs
    },
    warnings
  }
}

export async function getOptimizerState(): Promise<OptimizerBackupInfo> {
  const backup = await readBackup()
  if (!backup) return { hasBackup: false }
  return {
    hasBackup: true,
    backupAt: backup.backupAt,
    previous: backup.previous
  }
}

export async function analyzeOptimizer(force = false): Promise<OptimizerAnalysis> {
  const settings = await loadSettings()
  const signature = JSON.stringify({
    version: settings.selectedVersion,
    ram: settings.ramMb,
    java: settings.javaPath,
    args: settings.extraJvmArgs
  })

  if (
    !force &&
    analysisCache &&
    analysisCache.signature === signature &&
    Date.now() - analysisCache.at < CACHE_MS
  ) {
    const backup = await getOptimizerState()
    return { ...analysisCache.value, backup, cached: true }
  }

  const marker = settings.selectedVersion
    ? await readInstalledMarker(settings.gameDir, settings.selectedVersion)
    : null
  const baseVersion = marker?.baseVersion || settings.selectedVersion
  const loader: 'vanilla' | 'fabric' = marker?.kind === 'fabric' ? 'fabric' : 'vanilla'
  const hw = await hardware(force)
  const required = baseVersion ? await requiredJavaMajor(settings.gameDir, baseVersion) : null
  const detected = await detectJava()
  const javaInfo = currentJava(settings, detected, required)
  const { recommendations, patch, warnings } = buildRecommendations(
    settings,
    hw,
    javaInfo,
    loader
  )
  const backup = await getOptimizerState()

  const result: OptimizerAnalysis = {
    analyzedAt: new Date().toISOString(),
    versionId: settings.selectedVersion || 'Sin seleccionar',
    baseVersion: baseVersion || 'Desconocida',
    loader,
    hardware: hw,
    java: javaInfo,
    current: {
      ramMb: settings.ramMb,
      javaPath: settings.javaPath,
      extraJvmArgs: settings.extraJvmArgs
    },
    recommendations,
    warnings,
    patch,
    backup,
    cached: false
  }

  analysisCache = { at: Date.now(), signature, value: result }
  hardwareCache = { at: Date.now(), value: hw }
  log('info', `Análisis de equipo completado (${loader}, ${hw.totalMemMb} MB RAM)`)
  return result
}

export async function applyOptimizer(
  patch: OptimizerPatch,
  options: OptimizerApplyOptions
): Promise<{ settings: Settings; backupAt: string }> {
  if (!patch || typeof patch !== 'object') throw new Error('Recomendación no válida')
  if (!options || typeof options !== 'object') throw new Error('Opciones no válidas')

  const current = await loadSettings()
  const next: Partial<Settings> = {}

  if (options.applyRam) {
    if (!Number.isFinite(patch.ramMb)) throw new Error('Memoria recomendada no válida')
    next.ramMb = Math.min(maxRamMb(), Math.max(1024, Math.round(patch.ramMb)))
  }

  if (options.applyJava) {
    const value = typeof patch.javaPath === 'string' ? patch.javaPath.trim() : ''
    if (value && !existsSync(value)) {
      throw new Error('El ejecutable de Java recomendado ya no existe')
    }
    next.javaPath = value
  }

  if (options.applyJvm) {
    const value = typeof patch.extraJvmArgs === 'string' ? patch.extraJvmArgs.trim() : ''
    if (/-Xm[sx]\b|-cp\b|-classpath\b|-jar\b/i.test(value)) {
      throw new Error('Los argumentos recomendados no pueden reemplazar la memoria ni el classpath')
    }
    next.extraJvmArgs = value.replace(/[\r\n]+/g, ' ').slice(0, 1200)
  }

  if (Object.keys(next).length === 0) {
    throw new Error('No has seleccionado ningún cambio para aplicar')
  }

  const backupAt = await writeBackup(current)
  const settings = await saveSettings(next)
  analysisCache = null
  log('info', `Optimización aplicada: ${Object.keys(next).join(', ')}`)
  return { settings, backupAt }
}

export async function restoreOptimizer(): Promise<Settings> {
  const backup = await readBackup()
  if (!backup) throw new Error('No hay una configuración anterior guardada')

  const settings = await saveSettings(backup.previous)
  await fs.rm(backupFile(), { force: true }).catch(() => undefined)
  analysisCache = null
  log('info', 'Configuración de optimización restaurada')
  return settings
}

export async function restoreSettingsBackup(): Promise<Settings> {
  const file = join(app.getPath('userData'), 'settings.json')
  const backup = `${file}.bak`
  const parsed = await readJson<Partial<Settings>>(backup)
  if (!parsed) throw new Error('No hay una copia de seguridad válida de los ajustes')
  await copyFile(file, `${file}.before-restore`).catch(() => undefined)
  const settings = await saveSettings(parsed)
  log('info', 'Ajustes restaurados desde la copia de seguridad')
  return settings
}

export async function clearOptimizerCache(): Promise<void> {
  analysisCache = null
}

export function reportOptimizerError(error: unknown): void {
  logError('Error en el optimizador', error)
}
