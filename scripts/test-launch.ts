import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { flushVerificationCache, initVerificationCache } from '../src/main/minecraft/http'
import { launchGame, getVersionManifest } from '../src/main/minecraft/launch'
import { offlineUuid } from '../src/main/util/uuid'
import type { LaunchProgress } from '../src/shared/types'

const root = process.env.TEST_MC_ROOT ?? join(process.cwd(), '.test-mc')
const requested = process.argv[2]
const autoExitMs = Number(process.env.TEST_AUTO_EXIT_MS ?? 25000)

async function main(): Promise<void> {
  const startedAt = Date.now()
  await initVerificationCache(join(root, '.odissey', 'verified.json'))
  const manifest = await getVersionManifest(root)
  const versionId = requested ?? manifest.latest.release

  console.log(`[test] root: ${root}`)
  console.log(`[test] version: ${versionId}`)

  const controller = new AbortController()
  let lastStage = ''

  const game = await launchGame({
    versionId,
    session: {
      name: 'Tester',
      uuid: offlineUuid('Tester'),
      accessToken: '0',
      userType: 'legacy'
    },
    ramMb: 3072,
    root,
    quickPlaySingleplayer: process.env.TEST_QUICK_PLAY_SINGLEPLAYER,
    signal: controller.signal,
    onProgress: (progress: LaunchProgress) => {
      if (progress.stage !== lastStage || progress.percent === 100) {
        lastStage = progress.stage
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
        console.log(`[${elapsed}s] [${progress.stage}] ${progress.message} (${progress.percent}%)`)
      }
    },
    onLog: (line) => console.log(`[mc] ${line}`)
  })

  await flushVerificationCache()
  console.log(`[test] PID ${game.process.pid} iniciado`)

  let exited = false
  game.process.once('exit', (code) => {
    exited = true
    console.log(`[test] Minecraft terminó con código ${code}`)
    process.exit(code === 0 ? 0 : 1)
  })

  setTimeout(() => {
    if (!exited) {
      console.log('[test] Cerrando Minecraft de prueba...')
      if (process.platform === 'win32' && game.process.pid) {
        spawn('taskkill', ['/pid', String(game.process.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore'
        })
      } else {
        game.process.kill()
      }
      setTimeout(() => process.exit(0), 2500)
    }
  }, autoExitMs)
}

main().catch((error) => {
  console.error('[test] ERROR:', error instanceof Error ? error.message : error)
  process.exit(1)
})
