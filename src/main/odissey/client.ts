import { existsSync, promises as fs } from 'node:fs'
import { join } from 'node:path'

const CLIENT_JAR = 'odissey-client.jar'
const FABRIC_API_JAR = 'fabric-api.jar'

/** Remove only the Odissey overlay bundled by this launcher from its old profile. */
export async function removeOdisseyOverlay(instanceDir: string): Promise<void> {
  const marker = join(instanceDir, '.odissey', 'client.json')
  if (!existsSync(marker)) return

  const modsDir = join(instanceDir, 'mods')
  await fs.rm(join(modsDir, CLIENT_JAR), { force: true })

  try {
    const jars = (await fs.readdir(modsDir)).filter((name) => name.toLowerCase().endsWith('.jar'))
    if (jars.length === 1 && jars[0].toLowerCase() === FABRIC_API_JAR) {
      await fs.rm(join(modsDir, FABRIC_API_JAR), { force: true })
    }
  } catch {
    // The profile may not have a mods folder after the overlay is removed.
  }
}
