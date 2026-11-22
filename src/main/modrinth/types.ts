export interface RawSearchHit {
  project_id: string
  project_type: string
  slug: string
  author: string
  title: string
  description: string
  categories: string[]
  display_categories?: string[]
  versions: string[]
  downloads: number
  follows: number
  icon_url: string | null
  date_modified?: string
  color?: number | null
}

export interface RawSearchResponse {
  hits: RawSearchHit[]
  offset: number
  limit: number
  total_hits: number
}

export interface RawGalleryImage {
  url: string
  featured?: boolean
  title?: string
  description?: string
  created?: string
}

export interface RawProject {
  id: string
  slug: string
  project_type: string
  team: string
  title: string
  description: string
  body: string
  published: string
  updated: string
  approved: string
  status: string
  client_side: string
  server_side: string
  downloads: number
  followers: number
  categories: string[]
  additional_categories: string[]
  game_versions: string[]
  loaders: string[]
  icon_url: string | null
  gallery: RawGalleryImage[]
  source_url: string | null
  issues_url: string | null
  wiki_url: string | null
  discord_url: string | null
  license: { id: string; name: string; url: string | null }
  color?: number | null
}

export interface RawFile {
  hashes: { sha1?: string; sha512?: string }
  url: string
  filename: string
  primary: boolean
  size: number
  file_type?: string | null
}

export interface RawDependency {
  version_id: string | null
  project_id: string | null
  file_name: string | null
  dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded' | 'unknown'
}

export interface RawVersion {
  id: string
  project_id: string
  name: string
  version_number: string
  version_type: string
  game_versions: string[]
  loaders: string[]
  date_published: string
  downloads: number
  files: RawFile[]
  dependencies: RawDependency[]
}

export interface RawCategory {
  name: string
  project_type: string
  header: string
  icon: string
}
