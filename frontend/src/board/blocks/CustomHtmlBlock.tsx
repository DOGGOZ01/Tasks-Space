import { useEditor, useNode } from '@craftjs/core'
import DOMPurify from 'dompurify'
import { useMemo, useState } from 'react'
import { API_BASE } from '../../lib/api'
import { BlockShell } from '../BlockShell'
import type { BlockStyle } from '../blockStyle'
import { useBoardUi } from '../BoardUiContext'
import { useAuth } from '../../context/AuthContext'
import { applyGeometry } from '../geometry'

const BASE_FORBID_TAGS = ['iframe', 'object', 'embed', 'link', 'meta', 'form']

const BASE_IFRAME_CSP = `style-src 'unsafe-inline'; img-src data: ${API_BASE};`

// allowScripts mirrors the backend's ALLOW_CUSTOM_SCRIPTS setting (see
// tasks/settings.py) -- real enforcement is server-side.
function buildSrcDoc(html: string, allowScripts: boolean): string {
  const safe = DOMPurify.sanitize(html, {
    FORBID_TAGS: allowScripts ? BASE_FORBID_TAGS : [...BASE_FORBID_TAGS, 'script'],
    ADD_TAGS: allowScripts ? ['script'] : [],
    FORBID_ATTR: ['srcdoc'],
  })
  const csp = allowScripts
    ? `default-src 'none'; script-src 'unsafe-inline'; ${BASE_IFRAME_CSP}`
    : `default-src 'none'; ${BASE_IFRAME_CSP}`
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>body{margin:8px;font-family:sans-serif;overflow-wrap:anywhere;}</style></head><body>${safe}</body></html>`
}

export function CustomHtmlBlock() {
  const {
    id,
    connectors: { connect },
    x,
    y,
    width,
    height,
    html,
    style,
    actions: { setProp },
  } = useNode((node) => ({
    x: node.data.props.x as number,
    y: node.data.props.y as number,
    width: node.data.props.width as number,
    height: node.data.props.height as number,
    html: (node.data.props.html ?? '') as string,
    style: (node.data.props.style ?? {}) as BlockStyle,
  }))
  const { actions } = useEditor()
  const { editMode } = useBoardUi()
  const { allowCustomScripts } = useAuth()
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  const [draft, setDraft] = useState(html)

  const effectiveMode = editMode ? mode : 'preview'
  const srcDoc = useMemo(
    () => buildSrcDoc(effectiveMode === 'edit' ? draft : html, allowCustomScripts),
    [effectiveMode, draft, html, allowCustomScripts],
  )

  return (
    <BlockShell
      craftRef={connect}
      title="Custom HTML"
      decorative
      x={x}
      y={y}
      width={width}
      height={height}
      style={style}
      onStyleChange={(next) => setProp((props: Record<string, any>) => { props.style = next })}
      headerActions={
        <button
          type="button"
          className="block-quick-menu-item"
          onClick={() => {
            if (mode === 'edit') {
              setProp((props: Record<string, any>) => {
                props.html = draft
              })
            } else {
              setDraft(html)
            }
            setMode(mode === 'edit' ? 'preview' : 'edit')
          }}
        >
          {mode === 'edit' ? 'Save & preview' : 'Edit HTML/CSS'}
        </button>
      }
      onGeometryChange={(geometry) => applyGeometry(setProp, geometry)}
      onRemove={() => actions.delete(id)}
    >
      <div className="custom-html-block">
        {effectiveMode === 'edit' ? (
          <textarea
            className="custom-html-editor"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            placeholder="<div style=&quot;color: hotpink&quot;>Hello!</div>"
          />
        ) : (
          <iframe
            className={`custom-html-frame${editMode ? '' : ' custom-html-frame-bare'}`}
            sandbox={allowCustomScripts ? 'allow-scripts' : ''}
            srcDoc={srcDoc}
            title="Custom HTML block preview"
          />
        )}
      </div>
    </BlockShell>
  )
}

CustomHtmlBlock.craft = {
  displayName: 'CustomHtmlBlock',
  props: { x: 40, y: 400, width: 340, height: 240, html: '', style: {} },
}
