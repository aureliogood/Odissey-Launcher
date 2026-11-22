import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { CommunityContent } from '../shared/types'

// Odissey web usa este proyecto con una publishable key pública, protegida por RLS.
const SUPABASE_URL = 'https://cffpnxmtwfaublkvrobt.supabase.co'
const SUPABASE_PUBLIC_KEY = 'sb_publishable_BOU0olDLB4GZyp9fNr0OBw_SkIbB_w4'
const CACHE_FILE = 'community-content.json'
const CACHE_TTL_MS = 10 * 60 * 1000
const REQUEST_TIMEOUT_MS = 4500

let memoryCache: CommunityContent | null = null
let pending: Promise<CommunityContent> | null = null

function emptyContent(error?: string): CommunityContent {
  return { news: [], events: [], maintenance: null, fetchedAt: new Date(0).toISOString(), cached: false, error }
}

async function readCache(): Promise<CommunityContent | null> {
  if (memoryCache) return memoryCache
  try {
    const raw = await fs.readFile(join(app.getPath('userData'), CACHE_FILE), 'utf8')
    const value = JSON.parse(raw) as CommunityContent
    if (!Array.isArray(value.news) || !Array.isArray(value.events) || typeof value.fetchedAt !== 'string') return null
    memoryCache = { ...value, cached: true }
    return memoryCache
  } catch {
    return null
  }
}

async function query<T>(table: string, params: string): Promise<T[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      headers: { apikey: SUPABASE_PUBLIC_KEY, Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}` },
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body: unknown = await response.json()
    if (!Array.isArray(body)) throw new Error('Respuesta inválida del servicio de comunidad')
    return body as T[]
  } finally {
    clearTimeout(timer)
  }
}

export async function getCommunityContent(force = false): Promise<CommunityContent> {
  const cached = await readCache()
  if (!force && cached && Date.now() - Date.parse(cached.fetchedAt) < CACHE_TTL_MS) return cached
  if (pending) return pending

  pending = (async () => {
    try {
      const [news, events, maintenanceRows] = await Promise.all([
        query<{ id: string; title: string | null; category: string | null; text: string | null; date: string | null }>(
          'news', 'select=id,title,category,text,date,created_at&order=created_at.desc&limit=5'
        ),
        query<{ id: string; title: string | null; date: string | null; description: string | null }>(
          'events', 'select=id,title,date,description,created_at&order=created_at.desc&limit=4'
        ),
        query<{ activo: boolean; status: string | null; message: string | null }>(
          'maintenance', 'select=activo,status,message&id=eq.1&limit=1'
        )
      ])
      const row = maintenanceRows[0]
      const content: CommunityContent = {
        news: news.filter((item) => item.title).map((item) => ({
          id: item.id,
          title: item.title ?? '',
          category: item.category ?? 'Odissey',
          text: item.text ?? '',
          date: item.date ?? ''
        })),
        events: events.filter((item) => item.title).map((item) => ({
          id: item.id,
          title: item.title ?? '',
          date: item.date ?? '',
          description: item.description ?? ''
        })),
        maintenance: row ? {
          active: row.activo === true || row.status === 'maintenance',
          message: row.message ?? '',
          status: row.status ?? (row.activo ? 'maintenance' : 'online')
        } : null,
        fetchedAt: new Date().toISOString(),
        cached: false
      }
      memoryCache = content
      await fs.writeFile(join(app.getPath('userData'), CACHE_FILE), JSON.stringify(content), 'utf8').catch(() => undefined)
      return content
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Sin conexión al servicio de comunidad'
      if (cached) return { ...cached, cached: true, error: reason }
      return emptyContent(reason)
    }
  })().finally(() => { pending = null })
  return pending
}
