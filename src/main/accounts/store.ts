import { app, safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AccountSummary, AccountsState, AccountType } from '../../shared/types'
import { getDatabase } from '../database'
import { offlineUuid } from '../util/uuid'

export interface MicrosoftSecrets {
  refreshToken: string
  minecraftAccessToken: string
  minecraftExpiresAt: number
  xuid: string
}

export interface StoredAccount extends AccountSummary {
  secrets?: string
}

interface AccountsData {
  version: 1
  accounts: StoredAccount[]
  selectedId: string | null
}

const NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/

function accountsFile(): string {
  return join(app.getPath('userData'), 'accounts.json')
}

interface AccountRow {
  id: string
  type: string
  name: string
  uuid: string
  added_at: string
  needs_reauth: number
  secrets: string | null
}

async function mirrorAccounts(data: AccountsData): Promise<void> {
  const file = accountsFile()
  await mkdir(dirname(file), { recursive: true })
  await copyFile(file, `${file}.bak`).catch(() => undefined)
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(data, null, 2), 'utf8')
  await rename(temp, file)
}

async function writeAtomic(data: AccountsData): Promise<void> {
  const selectedId =
    data.selectedId && data.accounts.some((account) => account.id === data.selectedId)
      ? data.selectedId
      : (data.accounts[0]?.id ?? null)
  const next: AccountsData = { version: 1, accounts: data.accounts, selectedId }
  const db = getDatabase()

  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec('DELETE FROM accounts')
    const insert = db.prepare(
      `INSERT INTO accounts
        (id, type, name, uuid, added_at, needs_reauth, secrets, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    data.accounts.forEach((account, index) => {
      insert.run(
        account.id,
        account.type,
        account.name,
        account.uuid,
        account.addedAt,
        account.needsReauth ? 1 : 0,
        account.secrets ?? null,
        index
      )
    })
    db.prepare('UPDATE account_state SET selected_id = ? WHERE id = 1').run(selectedId)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  await mirrorAccounts(next).catch(() => undefined)
}

async function readLegacyData(): Promise<AccountsData> {
  try {
    const parsed = JSON.parse(await readFile(accountsFile(), 'utf8')) as AccountsData
    if (!parsed || !Array.isArray(parsed.accounts)) throw new Error('Formato inválido')
    return parsed
  } catch {
    return { version: 1, accounts: [], selectedId: null }
  }
}

function fromRow(row: AccountRow): StoredAccount {
  return {
    id: row.id,
    type: row.type as AccountType,
    name: row.name,
    uuid: row.uuid,
    addedAt: row.added_at,
    needsReauth: row.needs_reauth === 1,
    secrets: row.secrets ?? undefined
  }
}

async function readData(): Promise<AccountsData> {
  const db = getDatabase()
  const rows = db
    .prepare(
      `SELECT id, type, name, uuid, added_at, needs_reauth, secrets
       FROM accounts ORDER BY position ASC, rowid ASC`
    )
    .all() as unknown as AccountRow[]

  if (rows.length === 0) {
    const legacy = await readLegacyData()
    if (legacy.accounts.length > 0) {
      await writeAtomic(legacy)
      return {
        version: 1,
        accounts: legacy.accounts,
        selectedId:
          legacy.selectedId && legacy.accounts.some((account) => account.id === legacy.selectedId)
            ? legacy.selectedId
            : (legacy.accounts[0]?.id ?? null)
      }
    }
  }

  const accounts = rows.map(fromRow)
  const state = db.prepare('SELECT selected_id FROM account_state WHERE id = 1').get() as
    | { selected_id?: string | null }
    | undefined
  const selected =
    state?.selected_id && accounts.some((account) => account.id === state.selected_id)
      ? state.selected_id
      : (accounts[0]?.id ?? null)

  return { version: 1, accounts, selectedId: selected }
}

function toSummary(account: StoredAccount): AccountSummary {
  const { secrets: _secrets, ...summary } = account
  return summary
}

function encryptSecrets(secrets: MicrosoftSecrets): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'El almacenamiento seguro del sistema no está disponible. No se guardarán tokens de Microsoft.'
    )
  }
  return safeStorage.encryptString(JSON.stringify(secrets)).toString('base64')
}

function decryptSecrets(value: string): MicrosoftSecrets {
  const raw = safeStorage.decryptString(Buffer.from(value, 'base64'))
  return JSON.parse(raw) as MicrosoftSecrets
}

export async function getAccountsState(): Promise<AccountsState> {
  const data = await readData()
  return { accounts: data.accounts.map(toSummary), selectedId: data.selectedId }
}

export async function addOfflineAccount(name: string): Promise<AccountsState> {
  const trimmed = name.trim()
  if (!NAME_PATTERN.test(trimmed)) {
    throw new Error('Nombre inválido: usa entre 3 y 16 caracteres (letras, números o _)')
  }

  const data = await readData()
  const duplicate = data.accounts.some(
    (account) => account.type === 'offline' && account.name.toLowerCase() === trimmed.toLowerCase()
  )
  if (duplicate) throw new Error('Ya existe un perfil offline con ese nombre')

  const account: StoredAccount = {
    id: `offline-${randomUUID()}`,
    type: 'offline',
    name: trimmed,
    uuid: offlineUuid(trimmed),
    addedAt: new Date().toISOString()
  }

  data.accounts.push(account)
  data.selectedId = account.id
  await writeAtomic(data)
  return getAccountsState()
}

export async function removeAccount(id: string): Promise<AccountsState> {
  const data = await readData()
  const exists = data.accounts.some((account) => account.id === id)
  if (!exists) throw new Error('La cuenta no existe')

  data.accounts = data.accounts.filter((account) => account.id !== id)
  if (data.selectedId === id) {
    data.selectedId = data.accounts[0]?.id ?? null
  }
  await writeAtomic(data)
  return getAccountsState()
}

export async function selectAccount(id: string): Promise<AccountsState> {
  const data = await readData()
  if (!data.accounts.some((account) => account.id === id)) {
    throw new Error('La cuenta no existe')
  }
  data.selectedId = id
  await writeAtomic(data)
  return getAccountsState()
}

export async function getSelectedAccount(): Promise<StoredAccount | null> {
  const data = await readData()
  return data.accounts.find((account) => account.id === data.selectedId) ?? null
}

export async function upsertMicrosoftAccount(
  profile: { name: string; uuid: string },
  secrets: MicrosoftSecrets
): Promise<AccountsState> {
  const data = await readData()
  const id = `ms-${profile.uuid.replace(/-/g, '')}`
  const encrypted = encryptSecrets(secrets)
  const existing = data.accounts.find((account) => account.id === id)

  if (existing) {
    existing.name = profile.name
    existing.uuid = profile.uuid
    existing.needsReauth = false
    existing.secrets = encrypted
  } else {
    data.accounts.push({
      id,
      type: 'microsoft',
      name: profile.name,
      uuid: profile.uuid,
      addedAt: new Date().toISOString(),
      needsReauth: false,
      secrets: encrypted
    })
  }

  data.selectedId = id
  await writeAtomic(data)
  return getAccountsState()
}

export async function updateMicrosoftAccount(
  id: string,
  profile: { name: string; uuid: string } | null,
  secrets: MicrosoftSecrets | null,
  needsReauth = false
): Promise<void> {
  const data = await readData()
  const account = data.accounts.find((item) => item.id === id)
  if (!account) return

  if (profile) {
    account.name = profile.name
    account.uuid = profile.uuid
  }
  if (secrets) account.secrets = encryptSecrets(secrets)
  account.needsReauth = needsReauth

  await writeAtomic(data)
}

export async function getAccountSecrets(id: string): Promise<MicrosoftSecrets | null> {
  const data = await readData()
  const account = data.accounts.find((item) => item.id === id)
  if (!account?.secrets) return null

  try {
    return decryptSecrets(account.secrets)
  } catch {
    return null
  }
}

export async function markNeedsReauth(id: string): Promise<void> {
  const data = await readData()
  const account = data.accounts.find((item) => item.id === id)
  if (!account) return
  account.needsReauth = true
  account.secrets = undefined
  await writeAtomic(data)
}

export function validateOfflineName(name: string): boolean {
  return NAME_PATTERN.test(name)
}
