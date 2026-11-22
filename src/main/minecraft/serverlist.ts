import { app } from 'electron'
import { createConnection } from 'node:net'
import { resolveSrv } from 'node:dns/promises'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { rename } from 'node:fs/promises'
import type { ServerAddResult, ServerStatus } from '../../shared/types'
import { log } from '../logger'
import { loadSettings } from '../store'
import { compound, nbtByte, nbtList, nbtString, parseNbt, writeNbt, type NbtTag } from './nbt'

export const ODISSEY_SERVER = {
  name: 'OdisseyMC',
  host: '38.58.179.117',
  port: 25569
} as const

const ODISSEY_JOIN_ADDRESS = 'mc.odisseymc.lat'

const HOST_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/
const CACHE_OK_MS = 60 * 1000
const CACHE_FAIL_MS = 20 * 1000
const PING_TIMEOUT_MS = 2200
const MAX_RESPONSE = 2 * 1024 * 1024

let cache: ServerStatus | null = null
let pending: Promise<ServerStatus> | null = null
let diskCacheLoaded = false

async function loadDiskCache(): Promise<void> {
  if (diskCacheLoaded) return
  diskCacheLoaded = true
  try {
    const text = await fs.readFile(join(app.getPath('userData'), 'server-status.json'), 'utf8')
    const value = JSON.parse(text) as Partial<ServerStatus>
    if (
      typeof value.checkedAt === 'string' &&
      (value.online === true || value.online === false) &&
      typeof value.host === 'string' &&
      typeof value.port === 'number'
    ) {
      cache = {
        host: value.host,
        port: value.port,
        online: value.online,
        playersOnline: typeof value.playersOnline === 'number' ? value.playersOnline : null,
        playersMax: typeof value.playersMax === 'number' ? value.playersMax : null,
        motd: typeof value.motd === 'string' ? value.motd : null,
        version: typeof value.version === 'string' ? value.version : null,
        favicon: typeof value.favicon === 'string' ? value.favicon : null,
        latencyMs: typeof value.latencyMs === 'number' ? value.latencyMs : null,
        checkedAt: value.checkedAt,
        error: typeof value.error === 'string' ? value.error : undefined,
        cached: true
      }
    }
  } catch {
    // El caché es opcional; una ausencia o JSON inválido no impide iniciar.
  }
}

async function persistCache(status: ServerStatus): Promise<void> {
  const file = join(app.getPath('userData'), 'server-status.json')
  const temp = `${file}.${process.pid}.tmp`
  try {
    await fs.writeFile(temp, JSON.stringify(status), 'utf8')
    await rename(temp, file)
  } catch {
    await fs.rm(temp, { force: true }).catch(() => undefined)
  }
}

export async function getCachedServerStatus(): Promise<ServerStatus | null> {
  await loadDiskCache()
  return cache ? { ...cache, cached: true } : null
}

export function pendingServerStatus(): ServerStatus {
  return {
    host: ODISSEY_SERVER.host,
    port: ODISSEY_SERVER.port,
    online: null,
    playersOnline: null,
    playersMax: null,
    motd: null,
    version: null,
    favicon: null,
    latencyMs: null,
    checkedAt: now(),
    cached: false
  }
}

function now(): string {
  return new Date().toISOString()
}

function offlineStatus(error: string, cached: boolean): ServerStatus {
  return {
    host: ODISSEY_SERVER.host,
    port: ODISSEY_SERVER.port,
    online: false,
    playersOnline: null,
    playersMax: null,
    motd: null,
    version: null,
    favicon: null,
    latencyMs: null,
    checkedAt: now(),
    error,
    cached
  }
}

function writeVarInt(value: number): Buffer {
  const bytes: number[] = []
  let current = value >>> 0
  do {
    let temp = current & 0x7f
    current >>>= 7
    if (current !== 0) temp |= 0x80
    bytes.push(temp)
  } while (current !== 0)
  return Buffer.from(bytes)
}

function readVarInt(buffer: Buffer, offset: number): { value: number; size: number } | null {
  let value = 0
  let size = 0
  while (offset + size < buffer.length) {
    const byte = buffer[offset + size]
    value |= (byte & 0x7f) << (7 * size)
    size += 1
    if ((byte & 0x80) === 0) return { value, size }
    if (size > 5) return null
  }
  return null
}

function encodeString(value: string): Buffer {
  const data = Buffer.from(value, 'utf8')
  return Buffer.concat([writeVarInt(data.length), data])
}

function handshake(host: string, port: number): Buffer {
  const packet = Buffer.concat([
    Buffer.from([0x00]),
    writeVarInt(-1),
    encodeString(host),
    Buffer.from([(port >> 8) & 0xff, port & 0xff]),
    Buffer.from([0x01])
  ])
  return Buffer.concat([writeVarInt(packet.length), packet, Buffer.from([0x01, 0x00])])
}

function cleanMotd(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/§[0-9a-fk-orx]/gi, '').replace(/[\r\n]+/g, ' ').trim()
  return text ? text.slice(0, 300) : null
}

function parseStatus(json: string, started: number): ServerStatus {
  const data = JSON.parse(json) as {
    version?: { name?: unknown }
    players?: { online?: unknown; max?: unknown }
    description?: unknown
    favicon?: unknown
  }
  const rawDescription = data.description
  let description: string | null = null
  if (typeof rawDescription === 'string') description = cleanMotd(rawDescription)
  else if (rawDescription && typeof rawDescription === 'object') {
    const text = (rawDescription as { text?: unknown }).text
    description = cleanMotd(typeof text === 'string' ? text : null)
  }

  const online = Number(data.players?.online)
  const max = Number(data.players?.max)
  const favicon = typeof data.favicon === 'string' && data.favicon.startsWith('data:image/png;base64,')
    ? data.favicon.slice(0, 400_000)
    : null

  return {
    host: ODISSEY_SERVER.host,
    port: ODISSEY_SERVER.port,
    online: true,
    playersOnline: Number.isFinite(online) ? Math.max(0, Math.floor(online)) : null,
    playersMax: Number.isFinite(max) ? Math.max(0, Math.floor(max)) : null,
    motd: description,
    version: typeof data.version?.name === 'string' ? data.version.name.slice(0, 120) : null,
    favicon,
    latencyMs: Date.now() - started,
    checkedAt: now(),
    cached: false
  }
}

async function resolveMinecraftEndpoint(): Promise<{ host: string; port: number }> {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ODISSEY_SERVER.host)) {
    return { host: ODISSEY_SERVER.host, port: ODISSEY_SERVER.port }
  }
  try {
    const records = await resolveSrv(`_minecraft._tcp.${ODISSEY_SERVER.host}`)
    const selected = records
      .filter((record) => record.port > 0 && record.port <= 65535)
      .sort((a, b) => a.priority - b.priority || b.weight - a.weight)[0]
    if (selected) return { host: selected.name.replace(/\.$/, ''), port: selected.port }
  } catch {
    // Sin registro SRV, el estándar de Minecraft usa el puerto 25565.
  }
  return { host: ODISSEY_SERVER.host, port: ODISSEY_SERVER.port }
}

function ping(endpoint: { host: string; port: number }): Promise<ServerStatus> {
  const started = Date.now()
  return new Promise<ServerStatus>((resolve) => {
    let settled = false
    let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0)
    const finish = (status: ServerStatus): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(status)
    }

    const socket = createConnection(endpoint)
    const timer = setTimeout(() => finish(offlineStatus('Tiempo de espera agotado', false)), PING_TIMEOUT_MS)

    socket.setTimeout(PING_TIMEOUT_MS)
    socket.on('connect', () => socket.write(handshake(ODISSEY_SERVER.host, endpoint.port)))
    socket.on('timeout', () => finish(offlineStatus('Tiempo de espera agotado', false)))
    socket.on('close', () => {
      if (!settled) finish(offlineStatus('El servidor cerró la conexión sin responder', false))
    })
    socket.on('error', (error: NodeJS.ErrnoException) => {
      const reason = error.code === 'ENOTFOUND'
        ? 'No se pudo resolver el dominio'
        : error.code === 'ECONNREFUSED'
          ? 'Conexión rechazada'
          : 'No se pudo conectar'
      finish(offlineStatus(reason, false))
    })
    socket.on('data', (chunk: Buffer) => {
      buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk])
      if (buffer.length > MAX_RESPONSE) {
        finish(offlineStatus('Respuesta demasiado grande', false))
        return
      }
      const length = readVarInt(buffer, 0)
      if (!length || length.value < 1) return
      const total = length.size + length.value
      if (buffer.length < total) return
      const packetId = readVarInt(buffer, length.size)
      if (!packetId || packetId.value !== 0) {
        finish(offlineStatus('Respuesta no válida', false))
        return
      }
      const stringStart = length.size + packetId.size
      const stringLength = readVarInt(buffer, stringStart)
      if (!stringLength) return
      if (buffer.length < stringStart + stringLength.size + stringLength.value) return
      try {
        const jsonStart = stringStart + stringLength.size
        const json = buffer.subarray(jsonStart, jsonStart + stringLength.value).toString('utf8')
        finish(parseStatus(json, started))
      } catch {
        finish(offlineStatus('Respuesta no válida', false))
      }
    })
  })
}

export async function getServerStatus(force = false): Promise<ServerStatus> {
  await loadDiskCache()
  if (!HOST_PATTERN.test(ODISSEY_SERVER.host)) return offlineStatus('Dirección no válida', false)
  if (!force && cache) {
    const ttl = cache.online ? CACHE_OK_MS : CACHE_FAIL_MS
    if (Date.now() - new Date(cache.checkedAt).getTime() < ttl) {
      return { ...cache, cached: true }
    }
  }
  if (pending) return pending
  pending = resolveMinecraftEndpoint()
    .then((endpoint) => ping(endpoint))
    .then((status) => {
      cache = status
      void persistCache(status)
      return status
    })
    .finally(() => {
      pending = null
    })
  return pending
}

interface ServerEntry {
  name: string
  ip: string
}

function readEntries(root: NbtTag | null): { entries: ServerEntry[]; container: Record<string, NbtTag> } {
  const container = (root?.value ?? {}) as Record<string, NbtTag>
  const list = container.servers
  const entries: ServerEntry[] = []
  if (list?.type === 'list' && Array.isArray(list.value)) {
    for (const item of list.value as NbtTag[]) {
      if (item.type !== 'compound') continue
      const fields = item.value as Record<string, NbtTag>
      const name = fields.name?.value
      const ip = fields.ip?.value
      if (typeof name === 'string' && typeof ip === 'string') entries.push({ name, ip })
    }
  }
  return { entries, container }
}

function entryTag(entry: ServerEntry): NbtTag {
  return compound({
    name: nbtString(entry.name.slice(0, 64)),
    ip: nbtString(entry.ip.slice(0, 255)),
    acceptTextures: nbtByte(1)
  })
}

export async function addServerToMinecraft(targetDir?: string): Promise<ServerAddResult> {
  const settings = await loadSettings()
  const root = targetDir ?? settings.gameDir
  const target = join(root, 'servers.dat')
  await fs.mkdir(root, { recursive: true })

  let existing: NbtTag | null = null
  let existed = false
  try {
    const data = await fs.readFile(target)
    existed = true
    if (data.length > 4 * 1024 * 1024) throw new Error('servers.dat demasiado grande')
    existing = parseNbt(data)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      throw new Error('servers.dat está dañado o no se puede leer. No se ha modificado nada.')
    }
  }

  const { entries } = readEntries(existing)
  const matchesOdissey = (entry: ServerEntry): boolean => {
    const address = entry.ip.trim().toLowerCase()
    const host = address.startsWith('[')
      ? address.slice(1, address.indexOf(']'))
      : address.split(':')[0]
    return (
      host === ODISSEY_JOIN_ADDRESS ||
      host === ODISSEY_SERVER.host ||
      host === '38.58.179.118'
    )
  }
  const matchingIndices = entries.flatMap((entry, index) =>
    matchesOdissey(entry) ? [index] : []
  )
  if (
    matchingIndices.length === 1 &&
    entries[matchingIndices[0]].name === ODISSEY_SERVER.name &&
    entries[matchingIndices[0]].ip.toLowerCase() === ODISSEY_JOIN_ADDRESS
  ) {
    return {
      added: false,
      path: target,
      message: 'OdisseyMC ya está en la lista de servidores de Minecraft'
    }
  }
  const updatedExisting = matchingIndices.length > 0

  let backupPath: string | undefined
  if (existed) {
    const backupDir = join(root, '.odissey', 'backups')
    await fs.mkdir(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    backupPath = join(backupDir, `servers-${stamp}.dat`)
    await fs.copyFile(target, backupPath)
  }

  const canonicalEntry = { name: ODISSEY_SERVER.name, ip: ODISSEY_JOIN_ADDRESS }
  const nextEntries = updatedExisting
    ? entries.filter((_entry, index) => !matchingIndices.includes(index))
    : [...entries]
  nextEntries.splice(updatedExisting ? matchingIndices[0] : nextEntries.length, 0, canonicalEntry)
  const nextList = nbtList('compound', nextEntries.map(entryTag))
  const container = existing ? { ...((existing.value ?? {}) as Record<string, NbtTag>) } : {}
  container.servers = nextList

  const serialized = writeNbt(compound(container))
  const temp = `${target}.odissey.tmp`
  await fs.writeFile(temp, serialized)
  await fs.rename(temp, target)
  log('info', `Servidor ODISSEY añadido a servers.dat${backupPath ? ` (copia: ${backupPath})` : ''}`)

  return {
    added: !updatedExisting,
    path: target,
    backupPath,
    message: updatedExisting
      ? 'El servidor existente se actualizó como OdisseyMC con la dirección mc.odisseymc.lat'
      : existed
        ? 'OdisseyMC se añadió con una copia de seguridad de servers.dat'
        : 'OdisseyMC se añadió a un archivo servers.dat nuevo'
  }
}
