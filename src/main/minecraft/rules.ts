import type { LibraryRule } from './types'

export interface FeatureSet {
  [key: string]: boolean
}

function currentOsName(): string {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'osx'
  return 'linux'
}

function currentArch(): string {
  if (process.arch === 'ia32') return 'x86'
  return process.arch
}

function osMatches(os: NonNullable<LibraryRule['os']>): boolean {
  if (os.name && os.name !== currentOsName()) return false
  if (os.arch && os.arch !== currentArch()) return false
  return true
}

export function rulesAllow(rules: LibraryRule[] | undefined, features: FeatureSet = {}): boolean {
  if (!rules || rules.length === 0) return true

  let allowed = false

  for (const rule of rules) {
    if (rule.os && !osMatches(rule.os)) continue

    if (rule.features) {
      let matches = true
      for (const [key, value] of Object.entries(rule.features)) {
        if (features[key] !== value) {
          matches = false
          break
        }
      }
      if (!matches) continue
    }

    allowed = rule.action === 'allow'
  }

  return allowed
}
