import { app, shell } from 'electron'
import { createHash, createPublicKey, verify as verifySignature, type KeyObject } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  UpdateDownloadResult,
  UpdateInfo,
  UpdateInstallResult
} from '../shared/types'
import { downloadFile } from './minecraft/http'
import { log, logError } from './logger'

const UPDATE_URL_ENV = 'ODISSEY_UPDATE_URL'
const PUBLIC_KEY_ENV = 'ODISSEY_UPDATE_PUBKEY'
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/
const MAX_MANIFEST_BYTES = 512 * 1024

interface Manifest {
  version: string
  downloadUrl: string
  sha256: string
  size: number | null
  notes: string | null
  publishedAt: string | null
  mandatory: boolean
  signature: string | null
}

let lastInfo: UpdateInfo | null = null
let lastAuthentic = false
let checking: Promise<UpdateInfo> | null = null
let downloading: Promise<UpdateDownloadResult> | null = null

function baseInfo(): UpdateInfo {
  const configured = Boolean(process.env[UPDATE_URL_ENV]?.trim())
  const signatureConfigured = Boolean(process.env[PUBLIC_KEY_ENV]?.trim())
  return {
    configured,
    currentVersion: app.getVersion(),
    latestVersion: null,
    available: false,
    notes: null,
    publishedAt: null,
    mandatory: false,
    signatureConfigured,
    downloaded: false,
    installable: false,
    message: configured
      ? 'Pulsa «Buscar actualizaciones» para consultar el canal configurado.'
      : 'No hay un canal de actualizaciones configurado.',
    checkedAt: null
  }
}

function prefixed(value: string): string {
  return value.trim().replace(/^v/i, '')
}

function parseVersion(value: string): [number, number, number] | null {
  const match = prefixed(value).match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function isNewer(remote: string, current: string): boolean {
  const a = parseVersion(remote)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index]
  }
  return false
}

function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

function normalizeManifest(value: unknown): Manifest | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  const version = typeof data.version === 'string' ? prefixed(data.version) : ''
  const downloadUrl = sanitizeUrl(data.downloadUrl)
  const sha256 = typeof data.sha256 === 'string' ? data.sha256.trim().toLowerCase() : ''
  const size = Number(data.size)
  if (!VERSION_PATTERN.test(version) || !downloadUrl) return null
  if (!/^[a-f0-9]{64}$/.test(sha256)) return null
  return {
    version,
    downloadUrl,
    sha256,
    size: Number.isFinite(size) && size > 0 && size < 2 * 1024 * 1024 * 1024 ? Math.floor(size) : null,
    notes: typeof data.notes === 'string' ? data.notes.slice(0, 8000) : null,
    publishedAt: typeof data.publishedAt === 'string' ? data.publishedAt.slice(0, 64) : null,
    mandatory: Boolean(data.mandatory),
    signature: typeof data.signature === 'string' ? data.signature.trim() : null
  }
}

function signaturePayload(manifest: Manifest): Buffer {
  return Buffer.from(
    [
      manifest.version,
      manifest.downloadUrl,
      manifest.sha256,
      manifest.size ?? 0,
      manifest.mandatory ? 1 : 0
    ].join('\n'),
    'utf8'
  )
}

function publicKey(): KeyObject | null {
  const value = process.env[PUBLIC_KEY_ENV]?.trim()
  if (!value) return null
  try {
    if (value.includes('BEGIN PUBLIC KEY')) {
      return createPublicKey(value)
    }
    const raw = Buffer.from(value, 'base64')
    if (raw.length !== 32) return null
    const der = Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      raw
    ])
    return createPublicKey({ key: der, format: 'der', type: 'spki' })
  } catch (error) {
    logError('Clave pública de actualizaciones no válida', error)
    return null
  }
}

function manifestIsAuthentic(manifest: Manifest): boolean {
  const key = publicKey()
  if (!key || !manifest.signature) return false
  try {
    return verifySignature(
      null,
      signaturePayload(manifest),
      key,
      Buffer.from(manifest.signature, 'base64')
    )
  } catch {
    return false
  }
}

function updateFile(manifest: Manifest): string {
  const safeVersion = manifest.version.replace(/[^0-9A-Za-z.-]/g, '_')
  return join(app.getPath('userData'), 'updates', `odissey-${safeVersion}-setup.exe`)
}

async function hashSha256(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

async function fetchManifest(): Promise<Manifest> {
  const endpoint = process.env[UPDATE_URL_ENV]?.trim()
  if (!endpoint) throw new Error('No hay un canal de actualizaciones configurado')
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new Error('La URL de actualizaciones no es válida')
  }
  if (url.protocol !== 'https:') throw new Error('La URL de actualizaciones debe usar HTTPS')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  let text: string
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': `OdisseyClient/${app.getVersion()}`
      }
    })
    if (!response.ok) throw new Error(`El servidor de actualizaciones respondió HTTP ${response.status}`)
    text = await response.text()
    if (text.length > MAX_MANIFEST_BYTES) throw new Error('El manifiesto de actualización es demasiado grande')
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Tiempo de espera agotado al consultar actualizaciones')
    throw error
  } finally {
    clearTimeout(timer)
  }

  let manifest: Manifest | null
  try {
    manifest = normalizeManifest(JSON.parse(text))
  } catch {
    throw new Error('El manifiesto de actualización no es JSON válido')
  }
  if (!manifest) throw new Error('El manifiesto de actualización no tiene un formato válido')
  return manifest
}

export async function getUpdateInfo(): Promise<UpdateInfo> {
  if (lastInfo) return { ...lastInfo }
  const info = baseInfo()
  return info
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  if (checking) return checking
  checking = (async () => {
    const base = baseInfo()
    if (!base.configured) {
      lastInfo = base
      return base
    }

    try {
      const manifest = await fetchManifest()
      const authentic = manifestIsAuthentic(manifest)
      lastAuthentic = authentic
      const available = isNewer(manifest.version, app.getVersion())
      const file = updateFile(manifest)
      const existing = await stat(file).catch(() => null)
      let downloaded = false
      if (existing?.isFile() && (!manifest.size || existing.size === manifest.size)) {
        downloaded = (await hashSha256(file)) === manifest.sha256
      }

      const info: UpdateInfo = {
        ...base,
        latestVersion: manifest.version,
        available,
        notes: manifest.notes,
        publishedAt: manifest.publishedAt,
        mandatory: manifest.mandatory,
        signatureConfigured: Boolean(publicKey()),
        downloaded,
        installable: available && downloaded && authentic,
        message: !available
          ? 'Ya tienes la última versión disponible.'
          : !authentic
            ? 'Hay una actualización, pero el manifiesto no tiene una firma válida. No se permitirá instalar.'
            : downloaded
              ? 'Actualización descargada y verificada. Puedes instalarla.'
              : 'Hay una actualización disponible.',
        checkedAt: new Date().toISOString()
      }
      lastInfo = info
      log('info', `Comprobación de actualizaciones: remota ${manifest.version}, actual ${app.getVersion()}`)
      return info
    } catch (error) {
      lastAuthentic = false
      const message = error instanceof Error ? error.message : 'No se pudo comprobar la actualización'
      const info: UpdateInfo = {
        ...base,
        message,
        checkedAt: new Date().toISOString()
      }
      lastInfo = info
      return info
    }
  })().finally(() => {
    checking = null
  })
  return checking
}

export async function downloadUpdate(): Promise<UpdateDownloadResult> {
  if (downloading) return downloading
  downloading = (async () => {
    const info = await checkForUpdates()
    if (!info.available) {
      return { ready: false, verified: false, authentic: false, message: 'No hay una actualización disponible' }
    }

    const manifest = await fetchManifest()
    const authentic = manifestIsAuthentic(manifest)

    // Si la clave pública está configurada pero la firma no es válida, bloqueamos
    // la descarga para evitar que el usuario acabe con un instalador no verificado.
    if (publicKey() && !authentic) {
      return {
        ready: false,
        verified: false,
        authentic: false,
        message: 'El manifiesto de actualización no tiene una firma válida. Descarga bloqueada.'
      }
    }

    const file = updateFile(manifest)
    await mkdir(join(app.getPath('userData'), 'updates'), { recursive: true })

    const existing = await stat(file).catch(() => null)
    if (existing?.isFile() && (await hashSha256(file)) === manifest.sha256) {
      const result: UpdateDownloadResult = {
        ready: true,
        path: file,
        verified: true,
        authentic,
        message: authentic
          ? 'La actualización ya estaba descargada y verificada'
          : 'Descarga verificada por SHA-256, pero sin firma válida; no se puede instalar'
      }
      await refreshInfo()
      return result
    }

    try {
      await downloadFile({
        url: manifest.downloadUrl,
        dest: file,
        size: manifest.size ?? undefined
      })
    } catch (error) {
      logError('Error al descargar actualización', error)
      return {
        ready: false,
        verified: false,
        authentic: false,
        message: error instanceof Error ? error.message : 'No se pudo descargar la actualización'
      }
    }

    const actual = await hashSha256(file)
    if (actual !== manifest.sha256) {
      await rm(file, { force: true }).catch(() => undefined)
      return {
        ready: false,
        verified: false,
        authentic: false,
        message: 'La actualización descargada no coincide con el SHA-256 del manifiesto'
      }
    }

    await refreshInfo()
    return {
      ready: true,
      path: file,
      verified: true,
      authentic,
      message: authentic
        ? 'Actualización descargada y verificada'
        : 'Descarga verificada por SHA-256, pero la firma del manifiesto no es válida'
    }
  })().finally(() => {
    downloading = null
  })
  return downloading
}

async function refreshInfo(): Promise<void> {
  if (!lastInfo) return
  const manifestVersion = lastInfo.latestVersion
  if (!manifestVersion) return
  const file = join(app.getPath('userData'), 'updates', `odissey-${manifestVersion.replace(/[^0-9A-Za-z.-]/g, '_')}-setup.exe`)
  const existing = await stat(file).catch(() => null)
  const downloaded = Boolean(existing?.isFile())
  lastInfo = {
    ...lastInfo,
    downloaded,
    installable: lastInfo.available && downloaded && lastAuthentic,
    message: downloaded
      ? lastAuthentic
        ? 'Actualización descargada y verificada. Puedes instalarla.'
        : 'Descarga completada, pero la firma del manifiesto no es válida; la instalación está bloqueada.'
      : lastInfo.message
  }
}

export async function installUpdate(): Promise<UpdateInstallResult> {
  const info = await getUpdateInfo()
  if (!info.available || !info.latestVersion) {
    return { opened: false, message: 'No hay una actualización disponible para instalar' }
  }
  if (!info.downloaded) {
    return { opened: false, message: 'Descarga la actualización antes de instalarla' }
  }
  if (!info.signatureConfigured) {
    return {
      opened: false,
      message: 'Instalación bloqueada: configura la clave pública y firma el manifiesto'
    }
  }

  const manifest = await fetchManifest().catch(() => null)
  if (!manifest || !manifestIsAuthentic(manifest)) {
    return { opened: false, message: 'La firma de la actualización no es válida; instalación bloqueada' }
  }
  if (manifest.version !== info.latestVersion) {
    return { opened: false, message: 'El manifiesto cambió; vuelve a comprobar la actualización' }
  }

  const file = updateFile(manifest)
  if (!existsSync(file)) return { opened: false, message: 'El archivo de actualización ya no existe' }
  if (!/\.exe$/i.test(file)) return { opened: false, message: 'El archivo de actualización no es un instalador válido' }
  if ((await hashSha256(file)) !== manifest.sha256) {
    return { opened: false, message: 'El SHA-256 del instalador no coincide; instalación bloqueada' }
  }

  const openError = await shell.openPath(file)
  if (!openError) {
    log('info', `Instalador de actualización abierto: ${manifest.version}`)
    return {
      opened: true,
      message: 'Instalador abierto. La aplicación se cerrará cuando el instalador lo solicite.'
    }
  }

  try {
    const child = spawn(file, [], { detached: true, stdio: 'ignore' })
    child.unref()
    log('info', `Instalador de actualización iniciado: ${manifest.version}`)
    return { opened: true, message: 'Instalador iniciado' }
  } catch (error) {
    logError('No se pudo abrir el instalador', error)
    return { opened: false, message: `No se pudo abrir el instalador: ${openError}` }
  }
}
