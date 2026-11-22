import { connect, type Socket } from 'node:net'
import { log, logError } from './logger'

const APPLICATION_ID = '1562873987673890986'
const RETRY_MS = 15_000

/** Minimal Discord desktop IPC client for Rich Presence. */
export class DiscordPresence {
  private socket: Socket | null = null
  private buffer = Buffer.alloc(0)
  private retry: NodeJS.Timeout | null = null
  private stopped = true
  private nonce = 0
  private activity: Record<string, unknown> | null = null
  private ready = false
  private gamePid = 0
  private activityNonce: string | null = null

  start(gamePid: number | undefined): void {
    this.stopped = false
    this.gamePid = gamePid || process.pid
    this.activity = {
      details: 'Jugando Minecraft',
      state: 'Odissey Client',
      assets: { small_image: 'odissey', small_text: 'Odissey Client' }
    }
    this.connect()
  }

  stop(): void {
    this.stopped = true
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
    if (this.socket && !this.socket.destroyed) {
      if (this.ready) this.send(1, { cmd: 'SET_ACTIVITY', args: { pid: this.gamePid, activity: null }, nonce: String(++this.nonce) })
      this.socket.end()
    }
    this.socket = null
    this.ready = false
  }

  private connect(): void {
    if (this.stopped || this.socket) return
    if (process.platform !== 'win32') return this.scheduleRetry()

    const tryPipe = (index: number): void => {
      if (this.stopped || this.socket) return
      const socket = connect(`\\\\.\\pipe\\discord-ipc-${index}`)
      let settled = false
      const fail = (): void => {
        if (settled) return
        settled = true
        socket.destroy()
        if (index < 9) tryPipe(index + 1)
        else {
          log('warn', 'Discord Rich Presence: no se encontró un cliente Discord local abierto; se reintentará')
          this.scheduleRetry()
        }
      }
      socket.once('connect', () => {
        if (this.stopped) return socket.destroy()
        settled = true
        this.socket = socket
        socket.setTimeout(0)
        this.buffer = Buffer.alloc(0)
        socket.on('data', (chunk) => this.onData(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        socket.once('close', () => this.onClose(socket))
        socket.once('error', (error) => {
          logError('Discord Rich Presence: error en la conexión local', error)
          socket.destroy()
        })
        this.send(0, { v: 1, client_id: APPLICATION_ID })
        log('info', 'Discord Rich Presence: conexión local establecida; esperando respuesta')
      })
      socket.once('error', fail)
      socket.setTimeout(1200, fail)
    }

    tryPipe(0)
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.length >= 8) {
      const opcode = this.buffer.readUInt32LE(0)
      const length = this.buffer.readUInt32LE(4)
      if (length > 1024 * 1024) {
        this.socket?.destroy()
        return
      }
      if (this.buffer.length < 8 + length) return
      const payload = this.buffer.toString('utf8', 8, 8 + length)
      this.buffer = this.buffer.subarray(8 + length)
      if (opcode !== 1) continue
      try {
        const message = JSON.parse(payload) as { evt?: string; cmd?: string; nonce?: string; data?: unknown }
        if (message.evt === 'READY') {
          this.ready = true
          log('info', 'Discord Rich Presence: handshake aceptado por Discord')
          this.publish()
        } else if (message.evt === 'ERROR') {
          logError('Discord Rich Presence: Discord rechazó la actividad', payload)
        } else if (message.nonce && message.nonce === this.activityNonce) {
          if (message.evt === 'ERROR') {
            logError('Discord Rich Presence: Discord rechazó SET_ACTIVITY', payload)
          } else {
            log('info', 'Discord Rich Presence: Discord aceptó SET_ACTIVITY')
          }
        }
      } catch {
        // Ignore malformed or unrelated Discord IPC events.
      }
    }
  }

  private publish(): void {
    if (!this.ready || !this.activity) return
    this.activityNonce = String(++this.nonce)
    this.send(1, {
      cmd: 'SET_ACTIVITY',
      args: { pid: this.gamePid, activity: this.activity },
      nonce: this.activityNonce
    })
  }

  private send(opcode: number, payload: Record<string, unknown>): void {
    if (!this.socket || this.socket.destroyed) return
    const body = Buffer.from(JSON.stringify(payload), 'utf8')
    const header = Buffer.alloc(8)
    header.writeUInt32LE(opcode, 0)
    header.writeUInt32LE(body.length, 4)
    this.socket.write(Buffer.concat([header, body]))
  }

  private onClose(socket: Socket): void {
    if (this.socket !== socket) return
    this.socket = null
    this.ready = false
    this.scheduleRetry()
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retry) return
    this.retry = setTimeout(() => {
      this.retry = null
      this.connect()
    }, RETRY_MS)
    this.retry.unref()
  }
}

