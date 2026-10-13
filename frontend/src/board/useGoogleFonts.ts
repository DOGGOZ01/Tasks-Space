import { useEffect } from 'react'

const FONT_FAMILY_RE = /font-family\s*:\s*([^;}{<>]+)/gi
const FONT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$/
const MAX_FONTS = 20
const FONT_VARIANTS = '300,400,500,600,700,800,900,300italic,400italic,500italic,700italic'

const SKIPPED_FAMILIES = new Set(
  [
    'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
    'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong', 'inherit', 'initial', 'unset', 'revert',
    'revert-layer', 'arial', 'helvetica', 'helvetica neue', 'times', 'times new roman', 'courier',
    'courier new', 'georgia', 'verdana', 'tahoma', 'trebuchet ms', 'impact', 'segoe ui', 'consolas',
    'menlo', 'monaco', 'apple color emoji', 'segoe ui emoji', 'blinkmacsystemfont', '-apple-system',
    'space grotesk', 'plus jakarta sans', 'jetbrains mono',
  ],
)

const requestedFamilies = new Set<string>()

export function extractFontFamilies(text: string): string[] {
  const found = new Map<string, string>()
  for (const match of text.matchAll(FONT_FAMILY_RE)) {
    for (const part of match[1].split(',')) {
      const name = part.replace(/\\/g, '').replace(/!important/gi, '').replace(/["']/g, '').trim()
      const key = name.toLowerCase()
      if (!FONT_NAME_RE.test(name) || SKIPPED_FAMILIES.has(key) || found.has(key)) continue
      found.set(key, name)
      if (found.size >= MAX_FONTS) return [...found.values()]
    }
  }
  return [...found.values()]
}

function loadGoogleFont(family: string) {
  const key = family.toLowerCase()
  if (requestedFamilies.has(key)) return
  requestedFamilies.add(key)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css?family=${encodeURIComponent(family).replace(/%20/g, '+')}:${FONT_VARIANTS}&display=swap`
  document.head.appendChild(link)
}

export function useGoogleFonts(sources: unknown[]) {
  const text = JSON.stringify(sources)
  useEffect(() => {
    extractFontFamilies(text).forEach(loadGoogleFont)
  }, [text])
}
