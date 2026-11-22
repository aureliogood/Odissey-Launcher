export interface Settings {
  ramMb: number
  javaPath: string
  gameDir: string
  selectedVersion: string
  showSnapshots: boolean
  customResolution: boolean
  resolutionWidth: number
  resolutionHeight: number
  extraJvmArgs: string
  checkUpdatesOnStart: boolean
  minimizeToTrayOnGameStart: boolean
  autoCloseLauncherOnGameStart: boolean
  highPriorityGame: boolean
  cleanLogsOnLaunch: boolean
}

export type AccountType = 'microsoft' | 'offline'

export interface AccountSummary {
  id: string
  type: AccountType
  name: string
  uuid: string
  addedAt: string
  needsReauth?: boolean
}

export interface AccountsState {
  accounts: AccountSummary[]
  selectedId: string | null
}

export interface OAuthConfigInfo {
  configured: boolean
  clientId: string
  redirectUri: string
}

export interface SystemInfo {
  totalMemMb: number
  cpuCount: number
  platform: string
}

export interface VersionSummary {
  id: string
  type: string
  url: string
  time: string
  releaseTime: string
  sha1?: string
}

export interface VersionManifest {
  latest: { release: string; snapshot: string }
  versions: VersionSummary[]
}

export interface InstalledVersion {
  id: string
  status: 'installed' | 'partial'
  installedAt?: string
  kind?: 'vanilla' | 'fabric' | 'forge' | 'optifine'
  baseVersion?: string
  loaderVersion?: string
}

export type ContentKind = 'mod' | 'resourcepack'
export type CatalogSort = 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated'

export interface CatalogSearchRequest {
  kind: ContentKind
  query: string
  gameVersion: string
  category?: string
  sort: CatalogSort
  offset: number
  limit: number
  force?: boolean
}

export interface CatalogProject {
  id: string
  slug: string
  title: string
  description: string
  author: string
  iconUrl: string | null
  downloads: number
  followers: number
  categories: string[]
  gameVersions: string[]
  loaders: string[]
  projectType: string
  updatedAt?: string
  color?: number | null
}

export interface CatalogSearchResult {
  projects: CatalogProject[]
  total: number
  offset: number
  limit: number
}

export interface CatalogFile {
  url: string
  filename: string
  size: number
  sha1: string
  sha512?: string
  primary: boolean
}

export interface CatalogDependency {
  projectId: string
  versionId: string | null
  type: 'required' | 'optional' | 'incompatible' | 'embedded' | 'unknown'
  name?: string
  slug?: string
}

export interface CatalogVersion {
  id: string
  projectId: string
  name: string
  versionNumber: string
  versionType: string
  datePublished: string
  downloads: number
  gameVersions: string[]
  loaders: string[]
  files: CatalogFile[]
  dependencies: CatalogDependency[]
  compatible?: boolean
}

export interface CatalogGalleryImage {
  url: string
  title?: string
}

export interface CatalogProjectDetail {
  project: CatalogProject
  body: string
  gallery: CatalogGalleryImage[]
  license?: { id: string; name: string; url?: string }
  sourceUrl?: string
  issuesUrl?: string
  wikiUrl?: string
  discordUrl?: string
}

export interface CatalogCategory {
  name: string
  label?: string
}

export interface LibraryTarget {
  versionId: string
  baseVersion: string
  loader: 'vanilla' | 'fabric'
  loaderVersion?: string
  instanceDir: string
  modsDir: string
  resourcepacksDir: string
  isolated: boolean
  profileReady: boolean
  fabricProfileId?: string
}

export interface InstalledContent {
  kind: ContentKind
  projectId: string
  slug: string
  title: string
  author?: string
  iconUrl?: string | null
  versionId: string
  versionNumber: string
  gameVersions: string[]
  loader: string
  file: string
  size?: number
  installedAt: string
  missing?: boolean
  enabled?: boolean
  packIconData?: string
  packDescription?: string
  managed?: boolean
}

export interface LibraryInstallRequest {
  kind: ContentKind
  projectId: string
  versionId?: string
}

export interface LibraryRemoveRequest {
  kind: ContentKind
  projectId: string
}

export interface FabricProfileInfo {
  profileId: string
  baseVersion: string
  loaderVersion: string
}

export interface LibraryProgress {
  message: string
  percent: number
  bytesDone?: number
  bytesTotal?: number
  currentFile?: string
  bytesPerSecond?: number
  etaSeconds?: number | null
}

export interface OptimizerHardware {
  totalMemMb: number
  freeMemMb: number
  platform: string
  arch: string
  cpuModel: string
  cpuCount: number
  gpu: string | null
}

export interface AssetScanResult {
  scannedAt: string
  filesScanned: number
  duplicates: { hash: string; files: string[] }[]
  invalidArchives: { file: string; reason: string }[]
}

export interface OptimizerJava {
  requiredMajor: number | null
  selectedPath: string
  selectedMajor: number | null
  recommendedPath: string | null
  recommendedMajor: number | null
  compatible: boolean | null
  detected: JavaInfo[]
}

export interface OptimizerRecommendation {
  id: 'ram' | 'java' | 'jvm' | 'warning'
  title: string
  detail: string
  current: string
  recommended: string
  applicable: boolean
  tone: 'ok' | 'info' | 'warn'
}

export interface OptimizerPatch {
  ramMb: number
  javaPath: string
  extraJvmArgs: string
}

export interface OptimizerBackupInfo {
  hasBackup: boolean
  backupAt?: string
  previous?: Pick<Settings, 'ramMb' | 'javaPath' | 'extraJvmArgs'>
}

export interface OptimizerAnalysis {
  analyzedAt: string
  versionId: string
  baseVersion: string
  loader: 'vanilla' | 'fabric'
  hardware: OptimizerHardware
  java: OptimizerJava
  current: Pick<Settings, 'ramMb' | 'javaPath' | 'extraJvmArgs'>
  recommendations: OptimizerRecommendation[]
  warnings: string[]
  patch: OptimizerPatch
  backup: OptimizerBackupInfo
  cached: boolean
}

export interface OptimizerApplyOptions {
  applyRam: boolean
  applyJava: boolean
  applyJvm: boolean
}

export type DiagnosticSeverity = 'critical' | 'warning' | 'info'
export type DiagnosticActionKind =
  | 'open-file'
  | 'open-logs'
  | 'open-settings'
  | 'open-accounts'
  | 'open-versions'
  | 'open-mods'
  | 'reinstall-version'
  | 'restore-settings'

export interface DiagnosticAction {
  kind: DiagnosticActionKind
  label: string
  target?: string
  dangerous?: boolean
}

export interface DiagnosticIssue {
  id: string
  rule: string
  title: string
  description: string
  cause: string
  solution: string
  severity: DiagnosticSeverity
  confidence: number
  file?: string
  evidence?: string
  actions: DiagnosticAction[]
}

export interface DiagnosticReport {
  generatedAt: string
  files: string[]
  truncated: boolean
  crashLog?: { label: string; path: string; text: string; truncated: boolean } | null
  issues: DiagnosticIssue[]
  summary: Record<DiagnosticSeverity, number>
}

export interface ServerStatus {
  host: string
  port: number
  online: boolean | null
  playersOnline: number | null
  playersMax: number | null
  motd: string | null
  version: string | null
  favicon: string | null
  latencyMs: number | null
  checkedAt: string
  error?: string
  cached: boolean
}

export interface CommunityContent {
  news: Array<{ id: string; title: string; category: string; text: string; date: string }>
  events: Array<{ id: string; title: string; date: string; description: string }>
  maintenance: { active: boolean; message: string; status: string } | null
  fetchedAt: string
  cached: boolean
  error?: string
}

export interface RestorePoint {
  id: string
  createdAt: string
  sizeBytes: number
  includesWorlds: boolean
}

export interface ScreenshotItem {
  name: string
  path: string
  modifiedAt: string
  sizeBytes: number
  thumbnail: string
}

export interface ServerAddResult {
  added: boolean
  path: string
  backupPath?: string
  message: string
}

export interface UpdateInfo {
  configured: boolean
  currentVersion: string
  latestVersion: string | null
  available: boolean
  notes: string | null
  publishedAt: string | null
  mandatory: boolean
  signatureConfigured: boolean
  downloaded: boolean
  installable: boolean
  message: string
  checkedAt: string | null
}

export interface UpdateDownloadResult {
  ready: boolean
  path?: string
  verified: boolean
  authentic: boolean
  message: string
}

export interface UpdateInstallResult {
  opened: boolean
  message: string
}

export type LaunchStage =
  | 'manifest'
  | 'version'
  | 'libraries'
  | 'assets'
  | 'natives'
  | 'verify'
  | 'starting'
  | 'running'
  | 'complete'

export interface LaunchProgress {
  stage: LaunchStage
  message: string
  percent: number
  current?: number
  total?: number
  bytesDone?: number
  bytesTotal?: number
  currentFile?: string
  bytesPerSecond?: number
  etaSeconds?: number | null
}

export interface JavaInfo {
  path: string
  major: number | null
}

export interface LaunchRequest {
  versionId: string
  quickPlayServer?: string
}

export interface InstallRequest {
  versionId: string
}

export interface LauncherApi {
  platform: string
  getSettings(): Promise<Settings>
  saveSettings(patch: Partial<Settings>): Promise<Settings>
  getSystemInfo(): Promise<SystemInfo>
  getAccounts(): Promise<AccountsState>
  addOfflineAccount(name: string): Promise<AccountsState>
  removeAccount(id: string): Promise<AccountsState>
  selectAccount(id: string): Promise<AccountsState>
  loginMicrosoft(): Promise<AccountsState>
  cancelMicrosoftLogin(): Promise<void>
  getOAuthConfig(): Promise<OAuthConfigInfo>
  setOAuthClientId(clientId: string): Promise<OAuthConfigInfo>
  listVersions(force?: boolean): Promise<VersionManifest>
  listInstalled(): Promise<InstalledVersion[]>
  detectJava(requiredMajor?: number, force?: boolean): Promise<JavaInfo[]>
  launch(request: LaunchRequest): Promise<{ pid: number | undefined; versionId: string }>
  install(request: InstallRequest): Promise<void>
  stopGame(): Promise<void>
  cancelInstall(): Promise<void>
  pickJava(): Promise<string | null>
  pickDirectory(): Promise<string | null>
  openPath(target: string): Promise<void>
  openLogs(): Promise<void>
  getLogPath(): Promise<string>
  listScreenshots(): Promise<ScreenshotItem[]>
  openScreenshotFolder(): Promise<void>
  openScreenshot(path: string): Promise<void>
  getScreenshotData(path: string): Promise<string>
  deleteScreenshot(path: string): Promise<void>
  copyScreenshot(path: string): Promise<void>
  cleanupOldLogs(): Promise<{ deletedFiles: number; deletedBytes: number }>
  exportConfigBackup(): Promise<string | null>
  importConfigBackup(): Promise<Settings | null>
  listRestorePoints(): Promise<RestorePoint[]>
  createRestorePoint(includeWorlds: boolean): Promise<RestorePoint>
  restoreRestorePoint(id: string): Promise<void>
  notifyReady(): void
  searchCatalog(request: CatalogSearchRequest): Promise<CatalogSearchResult>
  getCatalogProject(projectId: string, force?: boolean): Promise<CatalogProjectDetail>
  getCatalogVersions(projectId: string, force?: boolean): Promise<CatalogVersion[]>
  getCatalogDependencies(versionId: string): Promise<CatalogDependency[]>
  getCatalogCategories(kind: ContentKind): Promise<CatalogCategory[]>
  getLibraryTarget(): Promise<LibraryTarget>
  listContent(kind: ContentKind): Promise<InstalledContent[]>
  installContent(request: LibraryInstallRequest): Promise<InstalledContent[]>
  removeContent(request: LibraryRemoveRequest): Promise<InstalledContent[]>
  setModEnabled(projectId: string, enabled: boolean): Promise<InstalledContent[]>
  ensureFabric(gameVersion: string): Promise<FabricProfileInfo>
  ensureForge(gameVersion: string): Promise<{ profileId: string; baseVersion: string; loaderVersion: string }>
  ensureOptifine(gameVersion: string): Promise<{ profileId: string; baseVersion: string }>
  openContentFolder(kind: ContentKind): Promise<void>
  openExternal(url: string): Promise<void>
  cancelLibrary(): Promise<void>
  analyzeOptimizer(force?: boolean): Promise<OptimizerAnalysis>
  applyOptimizer(
    patch: OptimizerPatch,
    options: OptimizerApplyOptions
  ): Promise<{ settings: Settings; backupAt: string }>
  restoreOptimizer(): Promise<Settings>
  getOptimizerState(): Promise<OptimizerBackupInfo>
  scanGameAssets(): Promise<AssetScanResult>
  openWindowsGpuSettings(): Promise<void>
  runDiagnostics(): Promise<DiagnosticReport>
  saveDiagnosticReport(report: DiagnosticReport): Promise<string | null>
  restoreSettingsBackup(): Promise<Settings>
  getServerStatus(force?: boolean): Promise<ServerStatus>
  getCommunityContent(force?: boolean): Promise<CommunityContent>
  onServerStatus(callback: (status: ServerStatus) => void): () => void
  addServerToMinecraft(): Promise<ServerAddResult>
  getUpdateInfo(): Promise<UpdateInfo>
  checkForUpdates(): Promise<UpdateInfo>
  downloadUpdate(): Promise<UpdateDownloadResult>
  installUpdate(): Promise<UpdateInstallResult>
  onProgress(callback: (progress: LaunchProgress) => void): () => void
  onLibraryProgress(callback: (progress: LibraryProgress) => void): () => void
  onLog(callback: (line: string) => void): () => void
  onExit(callback: (code: number | null) => void): () => void
}
