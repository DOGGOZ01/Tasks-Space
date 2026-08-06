export type AnimationScopeTarget = 'root' | 'header' | 'body' | 'input' | 'addButton'

const MAX_ANIMATION_CSS_LENGTH = 4000

const ANIMATION_CSS_PROPERTIES = new Set([
  'color', 'background', 'background-color', 'background-image', 'background-position',
  'background-size', 'background-repeat', 'border', 'border-radius', 'border-color',
  'border-style', 'border-width', 'font', 'font-family', 'font-size', 'font-weight',
  'font-style', 'text-align', 'text-decoration', 'text-shadow', 'line-height',
  'opacity', 'filter', 'box-shadow', 'letter-spacing', 'text-transform', 'padding',
  'transform', 'transform-origin', 'transition', 'transition-property',
  'transition-duration', 'transition-timing-function', 'transition-delay',
  'animation', 'animation-name', 'animation-duration', 'animation-timing-function',
  'animation-iteration-count', 'animation-delay', 'animation-direction', 'animation-fill-mode',
])

const ANIMATION_SELECTOR_ALLOWLIST = new Set(['&', '&:hover', '&:active', '&:focus', '&:focus-within'])
const KEYFRAME_STEP_RE = /^(from|to|\d{1,3}(\.\d+)?%)$/i
const KEYFRAME_NAME_VALID_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/
const RESERVED_KEYFRAME_NAMES = new Set(['none', 'inherit', 'initial', 'unset', 'revert'])
const UNSAFE_CSS_VALUE_RE = /expression\s*\(|-moz-binding|behavior\s*:|javascript\s*:/i
const CSS_URL_RE = /url\(\s*['"]?([^'")]+)/gi

function isSafeCssUrlValue(value: string): boolean {
  CSS_URL_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = CSS_URL_RE.exec(value))) {
    const target = match[1].trim().toLowerCase()
    if (!target.startsWith('/') && !target.startsWith('data:image/')) return false
  }
  return true
}

function isSafeCssValue(value: string): boolean {
  if (UNSAFE_CSS_VALUE_RE.test(value)) return false
  if (value.toLowerCase().includes('url(') && !isSafeCssUrlValue(value)) return false
  return true
}

function parseAnimationDeclarations(body: string): string[] {
  const kept: string[] = []
  for (const raw of body.split(';')) {
    const idx = raw.indexOf(':')
    if (idx === -1) continue
    const prop = raw.slice(0, idx).trim().toLowerCase()
    const value = raw.slice(idx + 1).trim()
    if (!prop || !value) continue
    if (!ANIMATION_CSS_PROPERTIES.has(prop)) continue
    if (!isSafeCssValue(value)) continue
    kept.push(`${prop}: ${value}`)
  }
  return kept
}

interface TopLevelRule {
  prelude: string
  body: string
  isAtRule: boolean
}

function splitTopLevelRules(css: string): TopLevelRule[] {
  const rules: TopLevelRule[] = []
  let depth = 0
  let preludeStart = 0
  let bodyStart = -1
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === '{') {
      if (depth === 0) bodyStart = i + 1
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && bodyStart !== -1) {
        const prelude = css.slice(preludeStart, bodyStart - 1).trim()
        const body = css.slice(bodyStart, i)
        rules.push({ prelude, body, isAtRule: prelude.startsWith('@') })
        preludeStart = i + 1
        bodyStart = -1
      }
    }
  }
  return rules
}

export function sanitizeAnimationCssStructure(raw: string | undefined): string {
  if (!raw) return ''
  const truncated = raw.slice(0, MAX_ANIMATION_CSS_LENGTH)
  const keptRules: string[] = []

  for (const rule of splitTopLevelRules(truncated)) {
    if (!rule.isAtRule) {
      if (!ANIMATION_SELECTOR_ALLOWLIST.has(rule.prelude)) continue
      const declarations = parseAnimationDeclarations(rule.body)
      if (declarations.length) keptRules.push(`${rule.prelude} { ${declarations.join('; ')}; }`)
      continue
    }

    const keyframesMatch = /^@keyframes\s+(.+)$/i.exec(rule.prelude)
    if (!keyframesMatch) continue
    const name = keyframesMatch[1].trim()
    if (!KEYFRAME_NAME_VALID_RE.test(name) || RESERVED_KEYFRAME_NAMES.has(name.toLowerCase())) continue

    const steps: string[] = []
    for (const step of splitTopLevelRules(rule.body)) {
      if (step.isAtRule) continue
      const tokens = step.prelude.split(',').map((token) => token.trim())
      if (!tokens.length || !tokens.every((token) => KEYFRAME_STEP_RE.test(token))) continue
      const stepDeclarations = parseAnimationDeclarations(step.body)
      if (stepDeclarations.length) steps.push(`${step.prelude.trim()} { ${stepDeclarations.join('; ')}; }`)
    }
    if (steps.length) keptRules.push(`@keyframes ${name} { ${steps.join(' ')} }`)
  }

  return keptRules.join('\n')
}

function hashString(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

export function scopeKeyFor(nodeId: string, target: AnimationScopeTarget): string {
  return hashString(`${nodeId}:${target}`)
}

const KEYFRAME_NAME_RE = /@keyframes\s+([A-Za-z_][\w-]*)/g

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function scopeAnimationCss(raw: string | undefined, scopeKey: string): string {
  if (!raw) return ''
  const safeSuffix = scopeKey.replace(/[^a-zA-Z0-9_-]/g, '')
  if (!safeSuffix) return ''

  const structurallySafe = sanitizeAnimationCssStructure(raw)
  if (!structurallySafe) return ''

  const keyframeNames = new Set<string>()
  KEYFRAME_NAME_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = KEYFRAME_NAME_RE.exec(structurallySafe))) {
    keyframeNames.add(match[1])
  }

  let scoped = structurallySafe
  for (const name of keyframeNames) {
    const namespaced = `kf_${safeSuffix}_${name}`
    const escaped = escapeForRegExp(name)
    const boundary = `(?<![\\w-])${escaped}(?![\\w-])`
    scoped = scoped.replace(new RegExp(`(@keyframes\\s+)${boundary}`, 'g'), `$1${namespaced}`)
    scoped = scoped.replace(
      /((?:^|[;{])\s*animation(?:-name)?\s*:\s*)([^;}]*)/gm,
      (_full: string, prefix: string, value: string) =>
        prefix + value.replace(new RegExp(boundary, 'g'), namespaced),
    )
  }

  const attr = `[data-anim-scope="${safeSuffix}"]`
  scoped = scoped.replace(/^&/gm, attr)

  return scoped
}
