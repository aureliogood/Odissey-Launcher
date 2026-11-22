import { app, dialog } from 'electron'
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Settings } from '../shared/types'
import { readInstalledMarker } from './minecraft/launch'
import { loadSettings, saveSettings } from './store'

const BACKUP_VERSION = 1
const MAX_CONFIG_BYTES = 2 * 1024 * 1024
const MOD_CONFIGS = [
  'config/sodium-options.json',
  'config/iris.properties',
  'optionsshaders.txt'
] as const

interface ConfigBackup {
  format: 'odissey-config'
  version: 1
  exportedAt: string
  settings: Pick<Settings, 'ramMb' | 'customResolution' | 'resolutionWidth' | 'resolutionHeight' | 'extraJvmArgs'>
  optionsText: string | null
  modConfigs: Record<string, string>
}

async function activeInstance(settings: Settings): Promise<string> {
  const marker = settings.selectedVersion
    ? await readInstalledMarker(settings.gameDir, settings.selectedVersion)
    : null
  return marker?.kind === 'fabric' && settings.selectedVersion
    ? join(settings.gameDir, 'instances', settings.selectedVersion)
    : settings.gameDir
}

async function readSmallFile(path: string): Promise<string | null> {
  const metadata = await stat(path).catch(() => null)
  if (!metadata?.isFile() || metadata.size > MAX_CONFIG_BYTES) return null
  return readFile(path, 'utf8').catch(() => null)
}

export async function exportConfigBackup(): Promise<string | null> {
  const settings = await loadSettings()
  const folder = await activeInstance(settings)
  const optionsText = await readSmallFile(join(folder, 'options.txt'))
  const modConfigs: Record<string, string> = {}
  for (const relativePath of MOD_CONFIGS) {
    const content = await readSmallFile(join(folder, relativePath))
    if (content !== null) modConfigs[relativePath] = content
  }

  const backup: ConfigBackup = {
    format: 'odissey-config',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: {
      ramMb: settings.ramMb,
      customResolution: settings.customResolution,
      resolutionWidth: settings.resolutionWidth,
      resolutionHeight: settings.resolutionHeight,
      extraJvmArgs: settings.extraJvmArgs
    },
    optionsText,
    modConfigs
  }
  const result = await dialog.showSaveDialog({
    title: 'Exportar configuración de Odissey',
    defaultPath: join(app.getPath('documents'), 'Odissey-config.json'),
    filters: [{ name: 'Respaldo JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, JSON.stringify(backup, null, 2), 'utf8')
  return result.filePath
}

async function writeConfig(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const current = await stat(path).catch(() => null)
  if (current?.isFile()) await copyFile(path, `${path}.before-import`).catch(() => undefined)
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, content, 'utf8')
  await rename(temporary, path)
}

export async function importConfigBackup(): Promise<Settings | null> {
  const result = await dialog.showOpenDialog({
    title: 'Importar configuración de Odissey',
    properties: ['openFile'],
    filters: [{ name: 'Respaldo JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePaths[0]) return null
  const file = result.filePaths[0]
  const metadata = await stat(file)
  if (!metadata.isFile() || metadata.size > 12 * 1024 * 1024) {
    throw new Error('El archivo de respaldo supera el tamaño permitido')
  }
  const value = JSON.parse(await readFile(file, 'utf8')) as Partial<ConfigBackup>
  if (value.format !== 'odissey-config' || value.version !== BACKUP_VERSION || !value.settings) {
    throw new Error('El archivo no es un respaldo compatible de Odissey')
  }
  if (value.optionsText !== null && value.optionsText !== undefined) {
    if (typeof value.optionsText !== 'string' || value.optionsText.length > MAX_CONFIG_BYTES || value.optionsText.includes('\0')) {
      throw new Error('El archivo options.txt del respaldo no es válido')
    }
  }
  const modConfigs = value.modConfigs ?? {}
  for (const [relativePath, content] of Object.entries(modConfigs)) {
    if (!(MOD_CONFIGS as readonly string[]).includes(relativePath)) {
      throw new Error('El respaldo contiene una ruta de configuración no permitida')
    }
    if (typeof content !== 'string' || content.length > MAX_CONFIG_BYTES || content.includes('\0')) {
      throw new Error(`La configuración ${relativePath} no es válida`)
    }
  }

  const settings = await saveSettings(value.settings)
  const folder = await activeInstance(settings)
  if (typeof value.optionsText === 'string') await writeConfig(join(folder, 'options.txt'), value.optionsText)
  for (const [relativePath, content] of Object.entries(modConfigs)) {
    await writeConfig(join(folder, relativePath), content)
  }
  return settings
}
