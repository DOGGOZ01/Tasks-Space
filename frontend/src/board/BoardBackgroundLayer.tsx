import DOMPurify from 'dompurify'
import { useMemo } from 'react'
import { API_BASE } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type { BoardBackground } from './boardBackground'

const BG_FORBID_TAGS = ['iframe', 'object', 'embed', 'link', 'meta', 'form']
const BG_IFRAME_CSP = `style-src 'unsafe-inline'; img-src data: ${API_BASE};`

function hashString(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return hash.toString(36)
}

function buildBackgroundSrcDoc(html: string, allowScripts: boolean): string {
  const safe = DOMPurify.sanitize(html, {
    FORBID_TAGS: allowScripts ? BG_FORBID_TAGS : [...BG_FORBID_TAGS, 'script'],
    ADD_TAGS: allowScripts ? ['script'] : [],
    FORCE_BODY: true,
    FORBID_ATTR: ['srcdoc'],
  })
  const csp = allowScripts
    ? `default-src 'none'; script-src 'unsafe-inline'; ${BG_IFRAME_CSP}`
    : `default-src 'none'; ${BG_IFRAME_CSP}`
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>body{margin:0;font-family:sans-serif;overflow-wrap:anywhere;}</style></head><body>${safe}</body></html>`
}

export function BoardBackgroundLayer({ background }: { background: BoardBackground }) {
  const { allowCustomScripts } = useAuth()
  const srcDoc = useMemo(
    () => buildBackgroundSrcDoc(background.html ?? '', allowCustomScripts),
    [background.html, allowCustomScripts],
  )

  return (
    <iframe
      key={hashString(srcDoc)}
      className="board-background-frame"
      sandbox={allowCustomScripts ? 'allow-scripts' : ''}
      srcDoc={srcDoc}
      title="Board background"
    />
  )
}
