import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { FabricProfileInfo, LaunchProgress } from '../../shared/types'
import { fetchJson } from '../minecraft/http'
import { installVersion } from '../minecraft/launch'
import type { Library } from '../minecraft/types'

const FABRIC_META = 'https://meta.fabricmc.net/v2'
const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

interface LoaderEntry {
  loader: {
    version: string
    stable: boolean
  }
}

interface FabricLibrary {
  name: string
  url?: string
  sha1?: string
  size?: number
}

interface FabricProfile {
  id: string
  inheritsFrom?: string
  mainClass: string
  type?: string
  releaseTime?: string
  libraries: FabricLibrary[]
  arguments?: {
    game?: Array<string | { value: string | string[]; rules?: unknown[] }>
    jvm?: Array<string | { value: string | string[]; rules?: unknown[] }>
  }
}

function mavenPath(name: string): string {
  const [group, artifact, version, classifier] = name.split(':')
  const file = classifier
    ? `${artifact}-${version}-${classifier}.jar`
    : `${artifact}-${version}.jar`
  return `${group.replace(/\./g, '/')}/${artifact}/${version}/${file}`
}

function normalizeLibraries(libraries: FabricLibrary[]): Library[] {
  return libraries.map((library) => {
    const path = mavenPath(library.name)
    const url = library.url
      ? `${library.url.endsWith('/') ? library.url : `${library.url}/`}${path}`
      : `https://maven.fabricmc.net/${path}`

    return {
      name: library.name,
      downloads: {
        artifact: {
          path,
          url,
          sha1: library.sha1,
          size: library.size
        }
      }
    }
  })
}

export async function fetchFabricLoader(baseVersion: string): Promise<{ version: string }> {
  if (!VERSION_PATTERN.test(baseVersion)) throw new Error('Versión de Minecraft no válida')

  const loaders = await fetchJson<LoaderEntry[]>(`${FABRIC_META}/versions/loader/${baseVersion}`)
  if (!Array.isArray(loaders) || loaders.length === 0) {
    throw new Error(`Fabric todavía no ofrece soporte para Minecraft ${baseVersion}.`)
  }

  const stable = loaders.find((entry) => entry.loader.stable) ?? loaders[0]
  if (!VERSION_PATTERN.test(stable.loader.version)) {
    throw new Error('Fabric devolvió una versión de loader no válida')
  }

  return { version: stable.loader.version }
}

export async function ensureFabricProfile(options: {
  root: string
  baseVersion: string
  signal: AbortSignal
  onProgress: (progress: LaunchProgress) => void
}): Promise<FabricProfileInfo> {
  const { root, baseVersion, signal, onProgress } = options
  if (!VERSION_PATTERN.test(baseVersion)) throw new Error('Versión de Minecraft no válida')

  onProgress({
    stage: 'version',
    message: `Buscando Fabric para ${baseVersion}...`,
    percent: 1
  })

  const { version: loaderVersion } = await fetchFabricLoader(baseVersion)
  const profileId = `fabric-loader-${loaderVersion}-${baseVersion}`
  if (!VERSION_PATTERN.test(profileId)) throw new Error('Perfil de Fabric no válido')

  const profile = await fetchJson<FabricProfile>(
    `${FABRIC_META}/versions/loader/${baseVersion}/${loaderVersion}/profile/json`,
    signal
  )

  if (!profile || !profile.mainClass || !Array.isArray(profile.libraries)) {
    throw new Error('Fabric devolvió un perfil no válido')
  }

  profile.id = profileId
  profile.inheritsFrom = baseVersion
  profile.libraries = normalizeLibraries(profile.libraries)

  const versionDir = join(root, 'versions', profileId)
  const jsonPath = join(versionDir, `${profileId}.json`)
  await fs.mkdir(versionDir, { recursive: true })
  const temp = `${jsonPath}.${process.pid}.tmp`
  await fs.writeFile(temp, JSON.stringify(profile, null, 2), 'utf8')
  await fs.rename(temp, jsonPath)

  await installVersion({
    versionId: profileId,
    root,
    signal,
    onProgress,
    metadata: {
      kind: 'fabric',
      baseVersion,
      loaderVersion
    }
  })

  return { profileId, baseVersion, loaderVersion }
}
