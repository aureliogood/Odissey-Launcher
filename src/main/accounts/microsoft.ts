import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { MicrosoftSecrets } from './store'
import { formatUuid } from '../util/uuid'

const AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0'
const SCOPE = 'XboxLive.signin offline_access'
const XBL_AUTH_URL = 'https://user.auth.xboxlive.com/user/authenticate'
const XSTS_URL = 'https://xsts.auth.xboxlive.com/xsts/authorize'
const MC_LOGIN_URL = 'https://api.minecraftservices.com/authentication/login_with_xbox'
const MC_ENTITLEMENTS_URL = 'https://api.minecraftservices.com/entitlements/mcstore'
const MC_PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile'

export type AuthErrorCode =
  | 'cancelled'
  | 'timeout'
  | 'oauth'
  | 'session_expired'
  | 'xbox_no_account'
  | 'xbox_region'
  | 'xbox_child'
  | 'xbox_banned'
  | 'no_game'
  | 'no_profile'
  | 'network'

export class MicrosoftAuthError extends Error {
  code: AuthErrorCode

  constructor(code: AuthErrorCode, message: string) {
    super(message)
    this.name = 'MicrosoftAuthError'
    this.code = code
  }
}

export interface MinecraftProfile {
  uuid: string
  name: string
}

export interface MinecraftSessionResult {
  profile: MinecraftProfile
  minecraftAccessToken: string
  minecraftExpiresAt: number
  xuid: string
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

interface XblResponse {
  Token: string
  DisplayClaims: { xui: Array<{ uhs: string; xid?: string }> }
}

interface XstsResponse extends XblResponse {}

interface MinecraftLoginResponse {
  access_token: string
  expires_in: number
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function abortError(): Error {
  return new MicrosoftAuthError('cancelled', 'Inicio de sesión cancelado')
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  signal?: AbortSignal
): Promise<Response> {
  const timeout = AbortSignal.timeout(25000)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  try {
    return await fetch(url, { ...init, signal: combined })
  } catch (error) {
    if (signal?.aborted) throw abortError()
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new MicrosoftAuthError('network', 'Microsoft tardó demasiado en responder')
    }
    throw new MicrosoftAuthError('network', 'No se pudo conectar con Microsoft. Revisa tu conexión.')
  }
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T
  } catch {
    throw new MicrosoftAuthError('oauth', 'Respuesta inválida del servicio de autenticación')
  }
}

/** Read only short, non-secret diagnostic fields from service error responses. */
async function readServiceError(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as {
      error?: unknown
      errorMessage?: unknown
      message?: unknown
      XErr?: unknown
    }
    const value = [body.errorMessage, body.message, body.error].find(
      (item): item is string => typeof item === 'string' && item.trim().length > 0
    )
    if (!value) return undefined
    // Avoid forwarding arbitrary server text, control characters, or oversized responses to UI.
    return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)
  } catch {
    return undefined
  }
}

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  codeChallenge: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: SCOPE,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  })
  return `${AUTHORITY}/authorize?${params.toString()}`
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character
  )
}

function callbackHtml(ok: boolean, message: string): string {
  const accent = ok ? '#f2c94c' : '#ff7a7a'
  const title = ok ? 'Cuenta conectada' : 'No se pudo completar'
  const safeMessage = escapeHtml(message)
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Odissey Client</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
    background: radial-gradient(900px 500px at 50% -10%, rgba(242,201,76,.14), transparent 65%), #070708;
    color:#f5f3ec; font-family: 'Segoe UI', system-ui, sans-serif; }
  .card { width:min(440px, calc(100vw - 48px)); padding:36px; border:1px solid rgba(255,255,255,.09);
    border-radius:22px; background:linear-gradient(180deg, rgba(255,255,255,.04), transparent), #101013;
    box-shadow:0 30px 80px rgba(0,0,0,.5); text-align:center; }
  .mark { width:52px; height:52px; margin:0 auto 18px; border-radius:15px;
    background:linear-gradient(145deg,#f7dd8a,#b8891f); display:grid; place-items:center;
    font-weight:800; color:#181201; font-size:22px; }
  h1 { margin:0 0 8px; font-size:22px; letter-spacing:-.02em; }
  p { margin:0; color:#a3a19a; font-size:14px; line-height:1.6; }
  .status { margin-top:20px; padding:10px 14px; border-radius:999px; display:inline-block;
    border:1px solid ${accent}44; background:${accent}14; color:${accent}; font-size:12px; font-weight:700;
    letter-spacing:.08em; text-transform:uppercase; }
</style></head>
<body><div class="card"><div class="mark">O</div><h1>${title}</h1><p>${safeMessage}</p>
<div class="status">${ok ? 'Puedes cerrar esta ventana' : 'Vuelve a Odissey Client'}</div></div></body></html>`
}

async function startCallbackServer(
  redirectUri: string,
  expectedState: string,
  signal: AbortSignal
): Promise<{ waitForCode: Promise<string>; cancel: () => void }> {
  const url = new URL(redirectUri)
  const port = Number(url.port || 80)

  let server: Server | null = null
  let finish: (fn: () => void) => void = () => undefined
  let resolveCode: (code: string) => void = () => undefined
  let rejectCode: (error: Error) => void = () => undefined
  let timer: NodeJS.Timeout | undefined
  let ready = false

  const waitForCode = new Promise<string>((resolve, reject) => {
    let finished = false
    resolveCode = resolve
    rejectCode = reject

    finish = (fn) => {
      if (finished) return
      finished = true
      if (timer) clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      server?.close()
      fn()
    }

    const onAbort = (): void => finish(() => reject(abortError()))

    timer = setTimeout(
      () =>
        finish(() =>
          reject(new MicrosoftAuthError('timeout', 'El inicio de sesión expiró. Inténtalo de nuevo.'))
        ),
      5 * 60 * 1000
    )

    signal.addEventListener('abort', onAbort, { once: true })
  })
  waitForCode.catch(() => undefined)

  server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', redirectUri)

    if (requestUrl.pathname !== url.pathname) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Not found')
      return
    }

    const error = requestUrl.searchParams.get('error')
    const description = requestUrl.searchParams.get('error_description')
    const state = requestUrl.searchParams.get('state')
    const code = requestUrl.searchParams.get('code')

    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'"
    })

    if (error) {
      response.end(
        callbackHtml(
          false,
          description?.slice(0, 200) ?? 'Microsoft canceló o rechazó el inicio de sesión.'
        )
      )
      finish(() => rejectCode(new MicrosoftAuthError('oauth', 'Microsoft rechazó el inicio de sesión')))
      return
    }

    if (!code || state !== expectedState) {
      response.end(callbackHtml(false, 'La respuesta de seguridad no es válida. Inténtalo de nuevo.'))
      finish(() => rejectCode(new MicrosoftAuthError('oauth', 'Respuesta OAuth inválida')))
      return
    }

    response.end(
      callbackHtml(
        true,
        'Autorización recibida. Vuelve a Odissey Client mientras se comprueba tu perfil y licencia de Minecraft.'
      )
    )
    finish(() => resolveCode(code))
  })

  const readyPromise = new Promise<void>((resolve, reject) => {
    server?.once('listening', () => {
      ready = true
      resolve()
    })
    server?.once('error', (error) => {
      const failure =
        error.message.includes('EADDRINUSE')
          ? 'El puerto de inicio de sesión está ocupado. Cierra el otro proceso y reinténtalo.'
          : 'No se pudo abrir el puerto de autenticación'
      const failureError = new MicrosoftAuthError('network', failure)

      finish(() => rejectCode(failureError))

      if (!ready) {
        reject(failureError)
      }
    })
  })

  if (signal.aborted) {
    finish(() => undefined)
    throw abortError()
  }

  server.listen(port, '127.0.0.1')

  await readyPromise

  return {
    waitForCode,
    cancel: () =>
      finish(() => rejectCode(new MicrosoftAuthError('cancelled', 'Inicio de sesión cancelado')))
  }
}

async function exchangeCode(
  clientId: string,
  redirectUri: string,
  code: string,
  verifier: string,
  signal: AbortSignal
): Promise<TokenResponse> {
  const response = await fetchWithTimeout(
    `${AUTHORITY}/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        scope: SCOPE
      })
    },
    signal
  )

  if (!response.ok) {
    const details = await readJson<{ error?: string; error_description?: string }>(response).catch(
      () => ({}) as { error?: string; error_description?: string }
    )
    if (details.error === 'invalid_grant') {
      throw new MicrosoftAuthError('session_expired', 'El código de autorización expiró')
    }
    throw new MicrosoftAuthError(
      'oauth',
      details.error_description?.slice(0, 200) ?? 'Microsoft rechazó la autorización'
    )
  }

  return readJson<TokenResponse>(response)
}

async function refreshMicrosoftToken(
  clientId: string,
  refreshToken: string,
  signal: AbortSignal
): Promise<TokenResponse> {
  const response = await fetchWithTimeout(
    `${AUTHORITY}/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: SCOPE
      })
    },
    signal
  )

  if (!response.ok) {
    const details = await readJson<{ error?: string }>(response).catch(() => ({}) as { error?: string })
    if (details.error === 'invalid_grant' || details.error === 'interaction_required') {
      throw new MicrosoftAuthError(
        'session_expired',
        'La sesión de Microsoft expiró. Vuelve a iniciar sesión.'
      )
    }
    throw new MicrosoftAuthError('oauth', 'No se pudo renovar la sesión de Microsoft')
  }

  return readJson<TokenResponse>(response)
}

async function xboxLiveAuthenticate(
  microsoftAccessToken: string,
  signal: AbortSignal
): Promise<XblResponse> {
  const response = await fetchWithTimeout(
    XBL_AUTH_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-xbl-contract-version': '1'
      },
      body: JSON.stringify({
        Properties: {
          AuthMethod: 'RPS',
          SiteName: 'user.auth.xboxlive.com',
          RpsTicket: `d=${microsoftAccessToken}`
        },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT'
      })
    },
    signal
  )

  if (!response.ok) {
    throw new MicrosoftAuthError('oauth', 'No se pudo autenticar con Xbox Live')
  }

  return readJson<XblResponse>(response)
}

async function xstsAuthorize(xblToken: string, signal: AbortSignal): Promise<XstsResponse> {
  const response = await fetchWithTimeout(
    XSTS_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-xbl-contract-version': '1'
      },
      body: JSON.stringify({
        Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT'
      })
    },
    signal
  )

  if (!response.ok) {
    const body = await readJson<{ XErr?: number }>(response).catch(
      () => ({}) as { XErr?: number }
    )

    switch (body.XErr) {
      case 2148916233:
        throw new MicrosoftAuthError(
          'xbox_no_account',
          'Esta cuenta de Microsoft no tiene un perfil de Xbox. Crea uno en xbox.com y vuelve a intentarlo.'
        )
      case 2148916235:
        throw new MicrosoftAuthError(
          'xbox_region',
          'Xbox Live no está disponible en el país de esta cuenta.'
        )
      case 2148916236:
      case 2148916237:
      case 2148916238:
        throw new MicrosoftAuthError(
          'xbox_child',
          'Esta cuenta es de un menor y necesita la aprobación de un adulto en Microsoft Family.'
        )
      case 2148916227:
      case 2148916228:
        throw new MicrosoftAuthError('xbox_banned', 'Esta cuenta de Xbox está suspendida.')
      default:
        throw new MicrosoftAuthError(
          'oauth',
          `Xbox Live rechazó la autenticación${body.XErr ? ` (código ${body.XErr})` : ` (HTTP ${response.status})`}`
        )
    }
  }

  return readJson<XstsResponse>(response)
}

async function minecraftLogin(
  xsts: XstsResponse,
  signal: AbortSignal
): Promise<{ response: MinecraftLoginResponse; xuid: string }> {
  const uhs = xsts.DisplayClaims.xui[0]?.uhs
  if (!uhs) throw new MicrosoftAuthError('oauth', 'Xbox Live devolvió una respuesta incompleta')

  const response = await fetchWithTimeout(
    MC_LOGIN_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ identityToken: `XBL3.0 x=${uhs};${xsts.Token}` })
    },
    signal
  )

  if (!response.ok) {
    const detail = await readServiceError(response)
    throw new MicrosoftAuthError(
      'oauth',
      `Minecraft rechazó la sesión de Xbox (HTTP ${response.status})${detail ? `: ${detail}` : ''}`
    )
  }

  return {
    response: await readJson<MinecraftLoginResponse>(response),
    xuid: xsts.DisplayClaims.xui[0]?.xid ?? ''
  }
}

async function checkEntitlement(accessToken: string, signal: AbortSignal): Promise<void> {
  const response = await fetchWithTimeout(
    MC_ENTITLEMENTS_URL,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    signal
  )

  if (response.status === 401) {
    throw new MicrosoftAuthError('session_expired', 'La sesión de Minecraft expiró')
  }
  if (!response.ok) {
    throw new MicrosoftAuthError('no_game', 'No se pudo comprobar la licencia de Minecraft')
  }

  const body = await readJson<{ items?: Array<{ name?: string }> }>(response)
  const items = body.items ?? []
  const ownsGame = items.some(
    (item) => item.name === 'product_minecraft' || item.name === 'game_minecraft'
  )

  if (!ownsGame) {
    throw new MicrosoftAuthError(
      'no_game',
      'Esta cuenta de Microsoft no tiene Minecraft: Java Edition. Inicia sesión con la cuenta que lo compró.'
    )
  }
}

async function fetchProfile(
  accessToken: string,
  signal: AbortSignal
): Promise<MinecraftProfile> {
  const response = await fetchWithTimeout(
    MC_PROFILE_URL,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    signal
  )

  if (response.status === 404) {
    throw new MicrosoftAuthError(
      'no_profile',
      'La cuenta no tiene un perfil de Minecraft: Java Edition.'
    )
  }
  if (!response.ok) {
    throw new MicrosoftAuthError('oauth', 'No se pudo obtener el perfil de Minecraft')
  }

  const profile = await readJson<{ id: string; name: string }>(response)
  return { uuid: formatUuid(profile.id), name: profile.name }
}

async function completeMinecraftAuth(
  microsoftAccessToken: string,
  signal: AbortSignal
): Promise<MinecraftSessionResult> {
  const xbl = await xboxLiveAuthenticate(microsoftAccessToken, signal)
  const xsts = await xstsAuthorize(xbl.Token, signal)
  const { response, xuid } = await minecraftLogin(xsts, signal)
  await checkEntitlement(response.access_token, signal)
  const profile = await fetchProfile(response.access_token, signal)

  return {
    profile,
    minecraftAccessToken: response.access_token,
    minecraftExpiresAt: Date.now() + response.expires_in * 1000,
    xuid
  }
}

export async function loginInteractive(
  clientId: string,
  redirectUri: string,
  openUrl: (url: string) => Promise<void>,
  signal: AbortSignal
): Promise<{ profile: MinecraftProfile; secrets: MicrosoftSecrets }> {
  const verifier = base64Url(randomBytes(48))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  const state = base64Url(randomBytes(24))
  const authUrl = buildAuthUrl(clientId, redirectUri, state, challenge)

  const { waitForCode, cancel } = await startCallbackServer(redirectUri, state, signal)
  waitForCode.catch(() => undefined)

  try {
    await openUrl(authUrl)
    const code = await waitForCode
    const tokens = await exchangeCode(clientId, redirectUri, code, verifier, signal)

    if (!tokens.refresh_token) {
      throw new MicrosoftAuthError('oauth', 'Microsoft no devolvió un token de renovación')
    }

    const session = await completeMinecraftAuth(tokens.access_token, signal)

    return {
      profile: session.profile,
      secrets: {
        refreshToken: tokens.refresh_token,
        minecraftAccessToken: session.minecraftAccessToken,
        minecraftExpiresAt: session.minecraftExpiresAt,
        xuid: session.xuid
      }
    }
  } finally {
    cancel()
  }
}

export async function refreshSession(
  clientId: string,
  secrets: MicrosoftSecrets,
  signal: AbortSignal
): Promise<{ profile: MinecraftProfile; secrets: MicrosoftSecrets }> {
  const tokens = await refreshMicrosoftToken(clientId, secrets.refreshToken, signal)
  const session = await completeMinecraftAuth(tokens.access_token, signal)

  return {
    profile: session.profile,
    secrets: {
      refreshToken: tokens.refresh_token ?? secrets.refreshToken,
      minecraftAccessToken: session.minecraftAccessToken,
      minecraftExpiresAt: session.minecraftExpiresAt,
      xuid: session.xuid || secrets.xuid
    }
  }
}
