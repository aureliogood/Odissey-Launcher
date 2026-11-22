export interface DownloadInfo {
  path?: string
  sha1?: string
  size?: number
  url: string
}

export interface LibraryRule {
  action: 'allow' | 'disallow'
  os?: { name?: string; arch?: string; version?: string }
  features?: Record<string, boolean>
}

export interface Library {
  name: string
  url?: string
  rules?: LibraryRule[]
  downloads?: {
    artifact?: DownloadInfo
    classifiers?: Record<string, DownloadInfo>
  }
  natives?: Record<string, string>
  extract?: { exclude?: string[] }
}

export interface VersionArgument {
  rules?: LibraryRule[]
  value: string | string[]
}

export interface AssetIndex extends DownloadInfo {
  id: string
  virtual?: boolean
  map_to_resources?: boolean
}

export interface VersionDetails {
  id: string
  type: string
  mainClass: string
  assets: string
  assetIndex?: AssetIndex
  downloads: {
    client: DownloadInfo
    server?: DownloadInfo
  }
  libraries: Library[]
  arguments?: {
    game: Array<string | VersionArgument>
    jvm: Array<string | VersionArgument>
  }
  minecraftArguments?: string
  javaVersion?: { component: string; majorVersion: number }
  logging?: {
    client?: {
      argument: string
      file: DownloadInfo & { id: string }
      type: string
    }
  }
  releaseTime?: string
  time?: string
}

export interface AssetObject {
  hash: string
  size: number
}

export interface AssetIndexContent {
  objects: Record<string, AssetObject>
  virtual?: boolean
  map_to_resources?: boolean
}
