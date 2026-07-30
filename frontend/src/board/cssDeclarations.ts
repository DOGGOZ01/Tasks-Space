import type { CSSProperties } from 'react'

const UNSAFE_VALUE_RE = /expression\(|-moz-binding|behavior\s*:|javascript:/i
const URL_RE = /url\(\s*['"]?([^'")]+)/gi

function isSafeUrlValue(value: string): boolean {
  URL_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = URL_RE.exec(value))) {
    const target = match[1].trim().toLowerCase()
    if (!target.startsWith('https:') && !target.startsWith('data:image/')) {
      return false
    }
  }
  return true
}

function toCamelCase(prop: string): string {
  return prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
}

export function sanitizeCssDeclarations(raw: string, allowedProps: Set<string>): CSSProperties {
  const result: Record<string, string> = {}
  if (!raw) return result

  for (const declaration of raw.split(';')) {
    const idx = declaration.indexOf(':')
    if (idx === -1) continue
    const prop = declaration.slice(0, idx).trim().toLowerCase()
    const value = declaration.slice(idx + 1).trim()
    if (!prop || !value) continue
    if (!allowedProps.has(prop)) continue
    if (UNSAFE_VALUE_RE.test(value)) continue
    if (value.includes('url(') && !isSafeUrlValue(value)) continue
    result[toCamelCase(prop)] = value
  }

  return result as CSSProperties
}
