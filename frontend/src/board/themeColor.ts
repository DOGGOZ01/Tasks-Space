const FALLBACKS: Record<string, string> = {
  '--bg': '#f6f1e7',
  '--text-h': '#221d15',
  '--border': '#d8cdb4',
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/
let cache: Record<string, string> | undefined

export function resolveThemeColor(varName: string): string {
  const fallback = FALLBACKS[varName] ?? '#000000'
  if (typeof document === 'undefined') return fallback
  cache ??= {}
  const cached = cache[varName]
  if (cached) return cached

  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  const resolved = HEX_RE.test(raw) ? raw : fallback
  cache[varName] = resolved
  return resolved
}
