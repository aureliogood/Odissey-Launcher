import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { OAuthConfigInfo } from '../../shared/types'
import { readSetting, writeSetting } from '../database'

// Must match the localhost callback registered for this application in Microsoft Entra.
export const REDIRECT_URI = 'http://localhost:48631/callback'
// Public OAuth application ID provided by the launcher owner. It is not a client secret.
const DEFAULT_CLIENT_ID = '1e72ad6d-29a4-402f-aca9-8a6627a42dad'
const CLIENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function configFile(): string {
  return join(app.getPath('userData'), 'oauth.json')
}

async function readLegacyClientId(): Promise<string> {
  try {
    const parsed = JSON.parse(await readFile(configFile(), 'utf8')) as { clientId?: string }
    return typeof parsed.clientId === 'string' ? parsed.clientId : ''
  } catch {
    return ''
  }
}

async function readClientId(): Promise<string> {
  const fromEnv = process.env.ODISSEY_MICROSOFT_CLIENT_ID?.trim()
  if (fromEnv) return fromEnv

  const stored = readSetting<string>('oauth.clientId')
  if (typeof stored === 'string' && stored) return stored

  const legacy = await readLegacyClientId()
  if (legacy) writeSetting('oauth.clientId', legacy)
  return legacy || DEFAULT_CLIENT_ID
}

async function mirrorClientId(clientId: string): Promise<void> {
  const file = configFile()
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify({ clientId }, null, 2), 'utf8')
  await rename(temp, file)
}

export async function getOAuthConfig(): Promise<OAuthConfigInfo> {
  const clientId = await readClientId()
  return {
    configured: CLIENT_ID_PATTERN.test(clientId),
    clientId,
    redirectUri: REDIRECT_URI
  }
}

export async function setOAuthClientId(clientId: string): Promise<OAuthConfigInfo> {
  const trimmed = clientId.trim()
  if (!CLIENT_ID_PATTERN.test(trimmed)) {
    throw new Error('El Client ID debe ser un GUID válido de una aplicación de Microsoft Entra')
  }

  writeSetting('oauth.clientId', trimmed)
  await mirrorClientId(trimmed).catch(() => undefined)
  return getOAuthConfig()
}
