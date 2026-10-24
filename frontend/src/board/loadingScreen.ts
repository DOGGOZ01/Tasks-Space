export interface LoadingScreen {
  html?: string
  color?: string
}

export const DEFAULT_LOADING_SCREEN: LoadingScreen = {}

export const LOADING_SCREEN_TIMEOUT_MS = 8000

const CACHE_KEY_PREFIX = 'tasks-space:loading-screen:'
const PREVIEW_URL_MAX_AGE_MS = 9 * 60 * 1000

interface CachedLoadingScreen {
  screen: LoadingScreen
  previewUrl?: string
  previewHtml?: string
  previewAt?: number
}

function cacheKey(username: string | undefined): string {
  return `${CACHE_KEY_PREFIX}${username ?? ''}`
}

function readCache(username: string | undefined): CachedLoadingScreen | null {
  try {
    const raw = localStorage.getItem(cacheKey(username))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedLoadingScreen
    return parsed && typeof parsed === 'object' && parsed.screen && typeof parsed.screen === 'object' ? parsed : null
  } catch {
    return null
  }
}

function writeCache(username: string | undefined, value: CachedLoadingScreen) {
  try {
    localStorage.setItem(cacheKey(username), JSON.stringify(value))
  } catch {}
}

export function readCachedLoadingScreen(username: string | undefined): LoadingScreen | null {
  return readCache(username)?.screen ?? null
}

export function cacheLoadingScreen(username: string | undefined, screen: LoadingScreen) {
  const existing = readCache(username)
  const keepPreview = existing?.previewHtml !== undefined && existing.previewHtml === screen.html
  writeCache(username, keepPreview ? { ...existing, screen } : { screen })
}

export function readCachedPreviewUrl(username: string | undefined, html: string): string | null {
  const cached = readCache(username)
  if (!cached?.previewUrl || cached.previewHtml !== html || !cached.previewAt) return null
  return Date.now() - cached.previewAt < PREVIEW_URL_MAX_AGE_MS ? cached.previewUrl : null
}

export function cachePreviewUrl(username: string | undefined, html: string, url: string) {
  const existing = readCache(username)
  writeCache(username, { screen: existing?.screen ?? {}, previewUrl: url, previewHtml: html, previewAt: Date.now() })
}

export function sameLoadingScreen(a: LoadingScreen, b: LoadingScreen): boolean {
  return (a.html ?? '') === (b.html ?? '') && (a.color ?? '') === (b.color ?? '')
}
