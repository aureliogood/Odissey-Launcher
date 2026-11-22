import { spawn } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import type { LaunchProgress } from '../../shared/types'
import { downloadFile, fetchJson } from './http'
import { detectJava } from './java'
import { installVersion } from './launch'

const FORGE_PROMOTIONS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
const OPTIFINE_DOWNLOADS = 'https://optifine.net/downloads'
const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

interface ForgePromotions { promos: Record<string, string> }

function progress(onProgress: (progress: LaunchProgress) => void, message: string, percent: number): void {
  onProgress({ stage: 'version', message, percent })
}

function javaMajorForMinecraft(version: string): number {
  const [major = '1', minorText = '0', patchText = '0'] = version.split('.')
  const minor = Number(minorText)
  const patch = Number(patchText)
  const parsedMajor = Number(major)
  if (parsedMajor >= 26 || (parsedMajor === 1 && (minor >= 21 || (minor === 20 && patch >= 5)))) return 21
  if (parsedMajor === 1 && minor >= 18) return 17
  if (parsedMajor === 1 && minor >= 17) return 16
  return 8
}

async function javaFor(version: string, preferred?: string, requiredMajor?: number): Promise<string> {
  const required = requiredMajor ?? javaMajorForMinecraft(version)
  const choices = await detectJava(required, preferred)
  const java = choices.find((candidate) => (candidate.major ?? 0) >= required)
  if (!java) throw new Error(`Forge/OptiFine para Minecraft ${version} requiere Java ${required} o superior. Configura Java en Ajustes.`)
  return java.path
}

function verifyJar(path: string): void {
  try {
    const zip = new AdmZip(path)
    if (zip.getEntries().length === 0) throw new Error('empty')
  } catch {
    throw new Error('El instalador descargado no es un JAR válido. No se ejecutó.')
  }
}

async function runJar(java: string, jar: string, args: string[], signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Error('Instalación cancelada'))
    const child = spawn(java, ['-jar', jar, ...args], { windowsHide: true, stdio: 'ignore' })
    const abort = (): void => { child.kill(); reject(new Error('Instalación cancelada')) }
    signal.addEventListener('abort', abort, { once: true })
    child.once('error', (error) => { signal.removeEventListener('abort', abort); reject(error) })
    child.once('close', (code) => {
      signal.removeEventListener('abort', abort)
      if (signal.aborted) reject(new Error('Instalación cancelada'))
      else if (code === 0) resolve()
      else reject(new Error(`El instalador terminó con código ${code ?? 'desconocido'}`))
    })
  })
}

async function writeMarker(root: string, versionId: string, metadata: { kind: 'forge' | 'optifine'; baseVersion: string; loaderVersion?: string }): Promise<void> {
  const versionDir = join(root, 'versions', versionId)
  const jar = join(versionDir, `${versionId}.jar`)
  const json = join(versionDir, `${versionId}.json`)
  if (!existsSync(jar) || !existsSync(json)) throw new Error('El instalador no creó un perfil completo en la carpeta de juego elegida.')
  await fs.writeFile(join(versionDir, '.odissey.json'), JSON.stringify({ ...metadata, versionId, installedAt: new Date().toISOString() }, null, 2), 'utf8')
}

export async function ensureForge(options: {
  root: string; baseVersion: string; javaPath?: string; signal: AbortSignal;
  onProgress: (progress: LaunchProgress) => void
}): Promise<{ profileId: string; baseVersion: string; loaderVersion: string }> {
  const { root, baseVersion, javaPath, signal, onProgress } = options
  if (!VERSION_PATTERN.test(baseVersion)) throw new Error('Versión de Minecraft no válida')
  progress(onProgress, `Buscando Forge para Minecraft ${baseVersion}...`, 2)
  const promotions = await fetchJson<ForgePromotions>(FORGE_PROMOTIONS, signal)
  const loaderVersion = promotions.promos[`${baseVersion}-recommended`] ?? promotions.promos[`${baseVersion}-latest`]
  if (!loaderVersion || !VERSION_PATTERN.test(loaderVersion)) throw new Error(`Forge todavía no publica una versión compatible con Minecraft ${baseVersion}.`)

  const profileId = `${baseVersion}-forge-${loaderVersion}`
  const installerName = `forge-${baseVersion}-${loaderVersion}-installer.jar`
  const installer = join(root, '.odissey', 'installers', installerName)
  const url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${baseVersion}-${loaderVersion}/${installerName}`
  progress(onProgress, 'Descargando el instalador oficial de Forge...', 8)
  await downloadFile({ url, dest: installer, signal })
  verifyJar(installer)
  const base = await installVersion({ versionId: baseVersion, root, signal, onProgress })
  progress(onProgress, 'Ejecutando Forge: instalar cliente...', 20)
  await runJar(await javaFor(baseVersion, javaPath, base.details.javaVersion?.majorVersion), installer, ['--installClient', root], signal)

  const jsonPath = join(root, 'versions', profileId, `${profileId}.json`)
  if (!existsSync(jsonPath)) {
    const dirs = await fs.readdir(join(root, 'versions'), { withFileTypes: true }).catch(() => [])
    const candidate = dirs.find((entry) => entry.isDirectory() && entry.name.includes('forge') && entry.name.includes(baseVersion))
    if (!candidate) throw new Error('Forge finalizó, pero no apareció el perfil en la carpeta de juego del launcher. Comprueba la ruta indicada en el instalador.')
    const candidateJson = JSON.parse(await fs.readFile(join(root, 'versions', candidate.name, `${candidate.name}.json`), 'utf8')) as { id?: string }
    if (!candidateJson.id) throw new Error('Forge creó un perfil ilegible.')
    await writeMarker(root, candidate.name, { kind: 'forge', baseVersion, loaderVersion })
    await installVersion({ versionId: candidate.name, root, signal, metadata: { kind: 'forge', baseVersion, loaderVersion }, onProgress })
    return { profileId: candidate.name, baseVersion, loaderVersion }
  }

  await writeMarker(root, profileId, { kind: 'forge', baseVersion, loaderVersion })
  await installVersion({ versionId: profileId, root, signal, metadata: { kind: 'forge', baseVersion, loaderVersion }, onProgress })
  return { profileId, baseVersion, loaderVersion }
}

function decodeHtml(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&#x2F;/gi, '/').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
}

function optifineInstallerUrl(html: string, baseVersion: string): string {
  const escapedVersion = baseVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const section = html.split(new RegExp(`<h2[^>]*>\\s*Minecraft\\s+${escapedVersion}\\s*</h2>`, 'i'))[1]
  if (!section) throw new Error(`OptiFine no publica una versión para Minecraft ${baseVersion}.`)
  const nextSection = section.search(/<h2\b/i)
  const block = nextSection >= 0 ? section.slice(0, nextSection) : section
  const rows = [...block.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map((match) => match[0])
  for (const row of rows) {
    const forgeCompatible = /Forge\s+(?!N\/A\b)[^<]+/i.test(row)
    const file = row.match(/OptiFine_[A-Za-z0-9._-]+\.jar/i)?.[0]
    if (!file || /pre\d+/i.test(file)) continue
    const href = row.match(/href=["']([^"']*(?:adloadx|downloadx)[^"']*)["']/i)?.[1]
    if (!href) continue
    const decoded = decodeHtml(href)
    if (decoded.includes('downloadx')) return new URL(decoded, OPTIFINE_DOWNLOADS).toString()
    if (decoded.includes('adloadx')) return `https://optifine.net/adloadx?f=${encodeURIComponent(file)}`
    if (forgeCompatible) return `https://optifine.net/adloadx?f=${encodeURIComponent(file)}`
  }
  throw new Error(`OptiFine no ofrece un instalador estable para Minecraft ${baseVersion}.`)
}

async function discoverOptifineProfile(root: string, baseVersion: string): Promise<string | null> {
  const versionsDir = join(root, 'versions')
  const entries = await fs.readdir(versionsDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory() || !/optifine/i.test(entry.name)) continue
    const jsonPath = join(versionsDir, entry.name, `${entry.name}.json`)
    const jarPath = join(versionsDir, entry.name, `${entry.name}.jar`)
    try {
      const json = JSON.parse(await fs.readFile(jsonPath, 'utf8')) as { inheritsFrom?: string; id?: string }
      if (json.id === entry.name && (json.inheritsFrom === baseVersion || entry.name.includes(baseVersion)) && (await fs.stat(jarPath)).size > 0) return entry.name
    } catch { /* Ignora perfiles ajenos o incompletos. */ }
  }
  return null
}

export async function ensureOptifine(options: {
  root: string; baseVersion: string; javaPath?: string; signal: AbortSignal;
  onProgress: (progress: LaunchProgress) => void
}): Promise<{ profileId: string; baseVersion: string }> {
  const { root, baseVersion, javaPath, signal, onProgress } = options
  if (!VERSION_PATTERN.test(baseVersion)) throw new Error('Versión de Minecraft no válida')
  progress(onProgress, `Consultando OptiFine para Minecraft ${baseVersion}...`, 2)
  const response = await fetch(OPTIFINE_DOWNLOADS, { signal })
  if (!response.ok) throw new Error(`No se pudo consultar OptiFine (HTTP ${response.status}).`)
  let installerUrl = optifineInstallerUrl(await response.text(), baseVersion)
  if (new URL(installerUrl).pathname.endsWith('/adloadx')) {
    const mirrorPage = await fetch(installerUrl, { signal })
    if (!mirrorPage.ok) throw new Error(`No se pudo abrir la descarga oficial de OptiFine (HTTP ${mirrorPage.status}).`)
    const mirrorHtml = await mirrorPage.text()
    const downloadHref = mirrorHtml.match(/href=["']([^"']*downloadx\?[^"']+)["']/i)?.[1]
    if (!downloadHref) throw new Error('OptiFine no entregó el enlace final de descarga. Inténtalo de nuevo más tarde.')
    installerUrl = new URL(decodeHtml(downloadHref), OPTIFINE_DOWNLOADS).toString()
  }
  const filename = new URL(installerUrl).searchParams.get('f')
  if (!filename || !/^OptiFine_[A-Za-z0-9._-]+\.jar$/i.test(filename)) throw new Error('OptiFine devolvió un enlace de descarga no válido.')
  const installer = join(root, '.odissey', 'installers', filename)
  progress(onProgress, 'Descargando el instalador oficial de OptiFine...', 8)
  await downloadFile({ url: installerUrl, dest: installer, signal })
  verifyJar(installer)

  const base = await installVersion({ versionId: baseVersion, root, signal, onProgress })
  progress(onProgress, 'Abriendo el instalador oficial de OptiFine...', 18)
  await runJar(await javaFor(baseVersion, javaPath, base.details.javaVersion?.majorVersion), installer, [], signal)
  const profileId = await discoverOptifineProfile(root, baseVersion)
  if (!profileId) throw new Error(`OptiFine terminó sin crear el perfil. En su ventana, selecciona la carpeta de juego del launcher: ${root}`)

  await writeMarker(root, profileId, { kind: 'optifine', baseVersion })
  // Conserva el JAR parcheado que genera OptiFine; la instalación estándar de Minecraft
  // vuelve a validar y completar dependencias al iniciar, sin sustituir ese archivo.
  progress(onProgress, 'Perfil de OptiFine preparado', 100)
  return { profileId, baseVersion }
}
