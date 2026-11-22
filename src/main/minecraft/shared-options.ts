import { promises as fs } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const OPTIONS_FILE = 'options.txt'

async function fileStat(path: string) {
  try {
    const stat = await fs.stat(path)
    return stat.isFile() ? stat : null
  } catch {
    return null
  }
}

async function copyFileAtomically(source: string, destination: string): Promise<void> {
  const contents = await fs.readFile(source)
  await fs.mkdir(dirname(destination), { recursive: true })
  const temporary = destination + '.' + process.pid + '.tmp'
  try {
    await fs.writeFile(temporary, contents)
    await fs.rename(temporary, destination)
    const sourceStat = await fs.stat(source)
    await fs.utimes(destination, sourceStat.atime, sourceStat.mtime)
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}

/**
 * Keep Minecraft's shared video, audio, controls and accessibility options
 * consistent between the common game directory and isolated Fabric profiles.
 * When adopting an existing profile, prefer the file modified most recently.
 */
export async function prepareSharedOptions(
  sharedGameDir: string,
  profileDir: string
): Promise<void> {
  const sharedRoot = resolve(sharedGameDir)
  const profileRoot = resolve(profileDir)
  if (sharedRoot === profileRoot) return

  const sharedFile = join(sharedRoot, OPTIONS_FILE)
  const profileFile = join(profileRoot, OPTIONS_FILE)
  const [sharedStat, profileStat] = await Promise.all([
    fileStat(sharedFile),
    fileStat(profileFile)
  ])

  if (!sharedStat && !profileStat) return
  if (!sharedStat && profileStat) {
    await copyFileAtomically(profileFile, sharedFile)
    return
  }
  if (sharedStat && !profileStat) {
    await copyFileAtomically(sharedFile, profileFile)
    return
  }

  if (profileStat!.mtimeMs > sharedStat!.mtimeMs) {
    await copyFileAtomically(profileFile, sharedFile)
  } else {
    await copyFileAtomically(sharedFile, profileFile)
  }
}

/** Publish the settings saved by Minecraft back to the common game directory. */
export async function saveSharedOptions(
  sharedGameDir: string,
  profileDir: string
): Promise<void> {
  const sharedRoot = resolve(sharedGameDir)
  const profileRoot = resolve(profileDir)
  if (sharedRoot === profileRoot) return

  const profileFile = join(profileRoot, OPTIONS_FILE)
  if (!(await fileStat(profileFile))) return
  await copyFileAtomically(profileFile, join(sharedRoot, OPTIONS_FILE))
}