import { app, dialog } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  DiagnosticAction,
  DiagnosticIssue,
  DiagnosticReport,
  DiagnosticSeverity
} from '../shared/types'
import { getLogFile } from './logger'
import { readInstalledMarker } from './minecraft/launch'
import { loadSettings } from './store'

const MAX_FILE_BYTES = 512 * 1024
const MAX_FILES = 8
const MAX_CRASH_FILES = 3

interface SourceFile {
  path: string
  label: string
  text: string
  truncated: boolean
}

function redact(text: string): string {
  return text
    .replace(/(access[_-]?token|refresh[_-]?token|authorization|bearer)(\s*[:=]\s*)[^\s,;"']+/gi, '$1$2[redactado]')
    .replace(/"accessToken"\s*:\s*"[^"]*"/gi, '"accessToken":"[redactado]"')
    .replace(/"refreshToken"\s*:\s*"[^"]*"/gi, '"refreshToken":"[redactado]"')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[correo]')
    .replace(/(password|contraseña|secret|client_secret)(\s*[:=]\s*)[^\s,;"']+/gi, '$1$2[redactado]')
}

async function readTail(path: string, label: string): Promise<SourceFile | null> {
  let handle
  try {
    const stat = await fs.stat(path)
    if (!stat.isFile() || stat.size === 0) return null
    const start = Math.max(0, stat.size - MAX_FILE_BYTES)
    handle = await fs.open(path, 'r')
    const length = stat.size - start
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, start)
    return {
      path,
      label,
      text: redact(buffer.toString('utf8')),
      truncated: start > 0
    }
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

async function listFiles(directory: string, suffix: RegExp): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && suffix.test(entry.name))
      .map((entry) => join(directory, entry.name))
  } catch {
    return []
  }
}

async function collectSources(): Promise<{ files: SourceFile[]; truncated: boolean }> {
  const settings = await loadSettings()
  const candidates: Array<{ path: string; label: string }> = []
  const launcherLog = getLogFile()
  if (launcherLog) {
    candidates.push({ path: launcherLog, label: 'Registro del launcher' })
    candidates.push({
      path: join(dirname(launcherLog), 'launcher.previous.log'),
      label: 'Registro anterior del launcher'
    })
  }

  const marker = settings.selectedVersion
    ? await readInstalledMarker(settings.gameDir, settings.selectedVersion)
    : null
  const instanceDir =
    marker?.kind === 'fabric' && settings.selectedVersion
      ? join(settings.gameDir, 'instances', settings.selectedVersion)
      : settings.gameDir

  candidates.push({ path: join(instanceDir, 'logs', 'latest.log'), label: 'Registro de Minecraft' })
  candidates.push({ path: join(settings.gameDir, 'logs', 'latest.log'), label: 'Registro de Minecraft (raíz)' })

  const crashFiles = (await listFiles(join(instanceDir, 'crash-reports'), /\.txt$/i))
    .sort()
    .reverse()
    .slice(0, MAX_CRASH_FILES)
  for (const file of crashFiles) {
    candidates.push({ path: file, label: `Informe de fallo · ${file.split(/[\\/]/).pop()}` })
  }
  const rootCrash = (await listFiles(join(settings.gameDir, 'crash-reports'), /\.txt$/i))
    .sort()
    .reverse()
    .slice(0, 1)
  for (const file of rootCrash) {
    candidates.push({ path: file, label: `Informe de fallo · ${file.split(/[\\/]/).pop()}` })
  }

  const seen = new Set<string>()
  const files: SourceFile[] = []
  let truncated = false
  for (const candidate of candidates) {
    if (files.length >= MAX_FILES) break
    if (seen.has(candidate.path)) continue
    seen.add(candidate.path)
    const file = await readTail(candidate.path, candidate.label)
    if (!file) continue
    files.push(file)
    if (file.truncated) truncated = true
  }

  return { files, truncated }
}

function firstEvidence(text: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(text)
  if (!match) return undefined
  const lineStart = text.lastIndexOf('\n', match.index) + 1
  const lineEnd = text.indexOf('\n', match.index)
  return text
    .slice(lineStart, lineEnd === -1 ? Math.min(text.length, lineStart + 300) : lineEnd)
    .trim()
    .slice(0, 300)
}

interface Rule {
  rule: string
  title: string
  pattern: RegExp
  severity: DiagnosticSeverity
  confidence: number
  description: string
  cause: string
  solution: string
  actions: (file?: string) => DiagnosticAction[]
  matches?: (text: string) => boolean
}

function openActions(file?: string, extra: DiagnosticAction[] = []): DiagnosticAction[] {
  const actions: DiagnosticAction[] = []
  if (file) actions.push({ kind: 'open-file', label: 'Abrir registro', target: file })
  actions.push({
    kind: 'open-logs',
    label: 'Abrir carpeta de registros',
    target: file ? dirname(file) : undefined
  })
  return [...actions, ...extra]
}

const rules: Rule[] = [
  {
    rule: 'java-unsupported',
    title: 'Versión de Java incompatible',
    pattern: /UnsupportedClassVersionError|class file version \d+|requires Java \d+|compiled by a more recent version|Unsupported major\.minor version/i,
    severity: 'critical',
    confidence: 0.96,
    description:
      'Minecraft o un mod se compiló para una versión de Java más reciente que la que está usando el launcher.',
    cause: 'El ejecutable de Java seleccionado es más antiguo que el requisito de la versión o del mod.',
    solution:
      'Abre Ajustes y selecciona un Java compatible (Java 21 o superior para versiones modernas). Después vuelve a iniciar.',
    actions: (file) =>
      openActions(file, [{ kind: 'open-settings', label: 'Elegir Java' }])
  },
  {
    rule: 'java-missing',
    title: 'Java no encontrado',
    pattern: /No se encontró Java|java(?:\.exe)?.*(?:not found|no such file)|The system cannot find the file specified.*java/i,
    severity: 'critical',
    confidence: 0.92,
    description: 'El launcher no pudo encontrar un ejecutable de Java válido para iniciar Minecraft.',
    cause: 'Java no está instalado o la ruta manual ya no existe.',
    solution: 'Instala Java 21 o superior y selecciona el ejecutable en Ajustes.',
    actions: (file) => openActions(file, [{ kind: 'open-settings', label: 'Ajustes de Java' }])
  },
  {
    rule: 'out-of-memory',
    title: 'Memoria insuficiente',
    pattern: /OutOfMemoryError|Java heap space|GC overhead limit exceeded|unable to allocate \d+ bytes/i,
    severity: 'critical',
    confidence: 0.9,
    description: 'La instancia de Minecraft se quedó sin memoria durante el inicio o la partida.',
    cause: 'La memoria asignada es baja para los mods o recursos instalados, o el equipo tiene poca memoria libre.',
    solution: 'Cierra otras aplicaciones y usa el Optimizador para revisar la memoria recomendada.',
    actions: (file) => openActions(file, [{ kind: 'open-settings', label: 'Revisar memoria' }])
  },
  {
    rule: 'mod-dependency-missing',
    title: 'Dependencia de mod ausente',
    pattern:
      /requires (?:any version of )?.{0,120}(?:which is missing|not installed)|missing dependenc|Missing (?:or unsupported )?(?:mandatory )?dependenc|depends on .{0,120}(?:which is missing|not found)|Incompatible mod set/i,
    severity: 'critical',
    confidence: 0.94,
    description: 'Un mod necesita otro mod que no está instalado o tiene una versión incompatible.',
    cause: 'Faltan dependencias requeridas o la versión instalada no coincide con la que exige el mod.',
    solution: 'Revisa la biblioteca de Mods e instala las dependencias requeridas para la misma versión.',
    actions: (file) => openActions(file, [{ kind: 'open-mods', label: 'Abrir Mods' }])
  },
  {
    rule: 'mod-incompatible',
    title: 'Conflicto entre mods',
    pattern:
      /NoSuchMethodError|NoClassDefFoundError|IncompatibleClassChangeError|MixinTransformerError|Mixin apply failed|ExceptionInInitializerError|ModResolutionException|java\.lang\.LinkageError/i,
    severity: 'warning',
    confidence: 0.82,
    description: 'Uno o varios mods parecen incompatibles entre sí o con esta versión de Minecraft/Fabric.',
    cause: 'Versiones de mods distintas a las requeridas, un mod duplicado o un loader desactualizado.',
    solution: 'Revisa los mods instalados y desactiva los sospechosos uno a uno. No se eliminará nada automáticamente.',
    actions: (file) => openActions(file, [{ kind: 'open-mods', label: 'Abrir Mods' }])
  },
  {
    rule: 'loader-mismatch',
    title: 'Loader incorrecto',
    pattern:
      /requires fabric[\s-]?loader\b|fabric-loader.{0,80}(?:not found|missing)|wrong loader|loader mismatch|requires (?:forge|neoforge|quilt)/i,
    severity: 'critical',
    confidence: 0.88,
    description: 'El perfil o un mod espera un loader distinto al que está usando la instancia.',
    cause: 'Se mezclaron mods de Fabric, Forge u otro loader, o el perfil no es Fabric.',
    solution: 'Usa un perfil Fabric para mods Fabric y comprueba que todos los mods sean de ese loader.',
    actions: (file) => openActions(file, [{ kind: 'open-mods', label: 'Abrir Mods' }])
  },
  {
    rule: 'missing-files',
    title: 'Archivos de Minecraft ausentes o dañados',
    pattern:
      /FileNotFoundException|NoSuchFileException|Could not find or load main class|Failed to locate library|missing asset|The game files are corrupted|SHA1|hash.*mismatch/i,
    severity: 'critical',
    confidence: 0.86,
    description: 'Falta un archivo necesario o una descarga no terminó correctamente.',
    cause: 'Instalación interrumpida, archivos eliminados o disco con problemas.',
    solution: 'Reinstala la versión seleccionada para verificar y recuperar solo los archivos que falten.',
    actions: (file) => [
      ...openActions(file),
      { kind: 'reinstall-version', label: 'Reinstalar versión', dangerous: true }
    ]
  },
  {
    rule: 'network',
    title: 'Problema de red o descarga',
    pattern:
      /UnknownHostException|Connection (?:reset|refused)|SocketTimeoutException|SSLHandshakeException|Failed to download|HTTP (?:5\d\d|429)|timeout.*download/i,
    severity: 'warning',
    confidence: 0.78,
    description: 'Una descarga o una conexión de red falló durante la preparación de Minecraft.',
    cause: 'Conexión inestable, servidor temporalmente no disponible o bloqueo de red.',
    solution: 'Comprueba la conexión y vuelve a intentar la instalación. Odissey reintenta errores recuperables.',
    actions: (file) => openActions(file, [{ kind: 'open-versions', label: 'Abrir Versiones' }])
  },
  {
    rule: 'auth-session',
    title: 'Sesión de cuenta inválida',
    pattern:
      /Invalid token|401 Unauthorized|authentication (?:failed|exception)|Failed to verify username|session.*expired|needsReauth|Invalid session/i,
    severity: 'warning',
    confidence: 0.8,
    description: 'La cuenta seleccionada no tiene una sesión válida para iniciar Minecraft.',
    cause: 'El token de Microsoft expiró o la sesión ya no es válida.',
    solution: 'Vuelve a iniciar sesión con Microsoft desde Cuentas.',
    actions: (file) =>
      openActions(file, [{ kind: 'open-accounts', label: 'Abrir Cuentas' }])
  },
  {
    rule: 'jvm-crash',
    title: 'Fallo crítico de la máquina virtual',
    pattern: /A fatal error has been detected by the Java Runtime|EXCEPTION_ACCESS_VIOLATION|SIGSEGV|hs_err_pid/i,
    severity: 'critical',
    confidence: 0.9,
    description: 'La máquina virtual de Java terminó de forma anómala.',
    cause: 'Controlador gráfico, un mod nativo o memoria insuficiente pueden provocar este fallo.',
    solution: 'Actualiza los controladores gráficos, retira mods con componentes nativos y revisa la memoria.',
    actions: (file) => openActions(file, [{ kind: 'open-settings', label: 'Revisar configuración' }])
  }
]

function severityWeight(severity: DiagnosticSeverity): number {
  return severity === 'critical' ? 3 : severity === 'warning' ? 2 : 1
}

function analyzeText(file: SourceFile): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = []
  for (const rule of rules) {
    if (!rule.pattern.test(file.text)) continue
    const evidence = firstEvidence(file.text, rule.pattern)
    issues.push({
      id: `${rule.rule}-${file.path}`,
      rule: rule.rule,
      title: rule.title,
      description: rule.description,
      cause: rule.cause,
      solution: rule.solution,
      severity: rule.severity,
      confidence: rule.confidence,
      file: file.path,
      evidence,
      actions: rule.actions(file.path)
    })
  }
  return issues
}

export async function runDiagnostics(): Promise<DiagnosticReport> {
  const { files, truncated } = await collectSources()
  const issues = files.flatMap(analyzeText)
  const seen = new Set<string>()
  const deduped = issues
    .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity) || b.confidence - a.confidence)
    .filter((issue) => {
      const key = `${issue.rule}:${issue.evidence ?? ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 20)

  const summary: Record<DiagnosticSeverity, number> = { critical: 0, warning: 0, info: 0 }
  for (const issue of deduped) summary[issue.severity] += 1
  const crashSource =
    files.find((file) => file.label.startsWith('Informe de fallo')) ??
    files.find((file) => file.label.startsWith('Registro de Minecraft'))

  return {
    generatedAt: new Date().toISOString(),
    files: files.map((file) => file.path),
    truncated,
    crashLog: crashSource
      ? {
          label: crashSource.label,
          path: crashSource.path,
          text: crashSource.text.slice(-24_000),
          truncated: crashSource.truncated || crashSource.text.length > 24_000
        }
      : null,
    issues: deduped,
    summary
  }
}

export async function saveDiagnosticReport(report: DiagnosticReport): Promise<string | null> {
  if (!report || !Array.isArray(report.issues) || report.issues.length > 200) {
    throw new Error('Informe de diagnóstico no válido')
  }
  const safe = redact(JSON.stringify(report, null, 2)).slice(0, 2 * 1024 * 1024)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const result = await dialog.showSaveDialog({
    title: 'Guardar informe de diagnóstico',
    defaultPath: join(app.getPath('documents'), `odissey-diagnostico-${stamp}.json`),
    filters: [{ name: 'Informe JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return null
  await fs.writeFile(result.filePath, safe, 'utf8')
  return result.filePath
}
