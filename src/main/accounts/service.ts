import type { AccountSummary, AccountsState, OAuthConfigInfo } from '../../shared/types'
import type { GameSession } from '../minecraft/launch'
import { log, logError } from '../logger'
import {
  getAccountSecrets,
  getSelectedAccount,
  markNeedsReauth,
  updateMicrosoftAccount,
  upsertMicrosoftAccount
} from './store'
import { MicrosoftAuthError, loginInteractive, refreshSession } from './microsoft'
import { getOAuthConfig, setOAuthClientId } from './oauth-config'

const TOKEN_MARGIN_MS = 60 * 1000

export async function getOAuthInfo(): Promise<OAuthConfigInfo> {
  return getOAuthConfig()
}

export async function saveOAuthClientId(clientId: string): Promise<OAuthConfigInfo> {
  return setOAuthClientId(clientId)
}

export async function loginMicrosoft(
  openUrl: (url: string) => Promise<void>,
  signal: AbortSignal
): Promise<AccountsState> {
  const config = await getOAuthConfig()
  if (!config.configured) {
    throw new Error(
      'Falta el Client ID de Microsoft. Añade el GUID de tu aplicación de Azure en Cuentas para activar el inicio de sesión.'
    )
  }

  try {
    const result = await loginInteractive(config.clientId, config.redirectUri, openUrl, signal)
    log('info', `Cuenta Microsoft autenticada: ${result.profile.name}`)
    return upsertMicrosoftAccount(result.profile, result.secrets)
  } catch (error) {
    if (error instanceof MicrosoftAuthError && error.code === 'cancelled') throw error
    logError('Inicio de sesión Microsoft fallido', error)
    throw error
  }
}

async function refreshAccount(
  account: AccountSummary,
  signal: AbortSignal
): Promise<GameSession> {
  const config = await getOAuthConfig()
  const secrets = await getAccountSecrets(account.id)

  if (!secrets) {
    await markNeedsReauth(account.id)
    throw new Error('Vuelve a iniciar sesión con Microsoft: la sesión guardada no está disponible.')
  }

  if (!config.configured) {
    throw new Error('Falta el Client ID de Microsoft en Ajustes para renovar esta cuenta.')
  }

  if (secrets.minecraftExpiresAt > Date.now() + TOKEN_MARGIN_MS) {
    return {
      name: account.name,
      uuid: account.uuid,
      accessToken: secrets.minecraftAccessToken,
      userType: 'msa',
      xuid: secrets.xuid,
      clientId: config.clientId
    }
  }

  try {
    const refreshed = await refreshSession(config.clientId, secrets, signal)
    await updateMicrosoftAccount(account.id, refreshed.profile, refreshed.secrets, false)
    log('info', `Sesión de Minecraft renovada: ${refreshed.profile.name}`)

    return {
      name: refreshed.profile.name,
      uuid: refreshed.profile.uuid,
      accessToken: refreshed.secrets.minecraftAccessToken,
      userType: 'msa',
      xuid: refreshed.secrets.xuid,
      clientId: config.clientId
    }
  } catch (error) {
    if (error instanceof MicrosoftAuthError && error.code === 'session_expired') {
      await markNeedsReauth(account.id)
      throw new Error('La sesión de Microsoft expiró. Vuelve a iniciar sesión desde Cuentas.')
    }

    if (error instanceof MicrosoftAuthError && error.code === 'network') {
      log('warn', 'Sin conexión para renovar el token; se usará el token guardado')
      return {
        name: account.name,
        uuid: account.uuid,
        accessToken: secrets.minecraftAccessToken,
        userType: 'msa',
        xuid: secrets.xuid,
        clientId: config.clientId
      }
    }

    logError('No se pudo renovar la sesión de Microsoft', error)
    throw error
  }
}

export async function buildSession(signal: AbortSignal): Promise<GameSession> {
  const account = await getSelectedAccount()
  if (!account) throw new Error('Selecciona o crea una cuenta antes de jugar')

  if (account.type === 'offline') {
    return {
      name: account.name,
      uuid: account.uuid,
      accessToken: '0',
      userType: 'legacy'
    }
  }

  if (account.needsReauth) {
    throw new Error('Esta cuenta de Microsoft necesita que vuelvas a iniciar sesión.')
  }

  return refreshAccount(account, signal)
}
