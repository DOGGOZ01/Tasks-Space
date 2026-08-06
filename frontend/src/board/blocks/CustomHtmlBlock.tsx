import { useEditor, useNode } from '@craftjs/core'
import DOMPurify from 'dompurify'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { API_BASE } from '../../lib/api'
import { BlockShell } from '../BlockShell'
import type { BlockStyle } from '../blockStyle'
import { useBoardUi } from '../BoardUiContext'
import { useAuth } from '../../context/AuthContext'
import { applyGeometry } from '../geometry'
import { useTaskBoard } from '../TaskBoardContext'
import { useDragOffset } from '../useDragOffset'
import { reorderZIndex } from '../zOrder'
import { startOfWeekKey, todayKey, type TasksByDate } from './taskListHelpers'

const BASE_FORBID_TAGS = ['iframe', 'object', 'embed', 'link', 'meta', 'form']

const BASE_IFRAME_CSP = `style-src 'unsafe-inline'; img-src data: ${API_BASE};`

interface TaskBoardData {
  dailyTasks: TasksByDate
  weeklyTasks: TasksByDate
  todayKey: string
  startOfWeekKey: string
}

function serializeForScriptTag(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

function buildSrcDoc(html: string, allowScripts: boolean, taskData: TaskBoardData): string {
  const safe = DOMPurify.sanitize(html, {
    FORBID_TAGS: allowScripts ? BASE_FORBID_TAGS : [...BASE_FORBID_TAGS, 'script'],
    ADD_TAGS: allowScripts ? ['script'] : [],
    FORBID_ATTR: ['srcdoc'],
  })
  const csp = allowScripts
    ? `default-src 'none'; script-src 'unsafe-inline'; ${BASE_IFRAME_CSP}`
    : `default-src 'none'; ${BASE_IFRAME_CSP}`
  const dataScript = allowScripts
    ? `<script>window.taskBoardData = ${serializeForScriptTag(taskData)};</script>`
    : ''
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">${dataScript}<style>html,body{background:transparent;}body{margin:8px;font-family:sans-serif;overflow-wrap:anywhere;}</style></head><body>${safe}</body></html>`
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
    zIndex,
    actions: { setProp },
  } = useNode((node) => ({
    x: node.data.props.x as number,
    y: node.data.props.y as number,
    width: node.data.props.width as number,
    height: node.data.props.height as number,
    html: (node.data.props.html ?? '') as string,
    style: (node.data.props.style ?? {}) as BlockStyle,
    zIndex: (node.data.props.zIndex ?? 0) as number,
  }))
  const { actions, query } = useEditor()
  const { editMode } = useBoardUi()
  const { allowCustomScripts } = useAuth()
  const { dailyTasks, weeklyTasks } = useTaskBoard()
  const [modalOpen, setModalOpen] = useState(false)
  const [draft, setDraft] = useState(html)
  const { offset, dragHandleProps, reset: resetOffset } = useDragOffset()

  const srcDoc = useMemo(
    () =>
      buildSrcDoc(html, allowCustomScripts, {
        dailyTasks,
        weeklyTasks,
        todayKey: todayKey(),
        startOfWeekKey: startOfWeekKey(),
      }),
    [html, allowCustomScripts, dailyTasks, weeklyTasks],
  )

  function openModal() {
    setDraft(html)
    resetOffset()
    setModalOpen(true)
  }

  function saveModal() {
    setProp((props: Record<string, any>) => {
      props.html = draft
    })
    setModalOpen(false)
  }

  return (
    <BlockShell
      nodeId={id}
      craftRef={connect}
      title="Custom HTML"
      decorative
      x={x}
      y={y}
      width={width}
      height={height}
      style={style}
      onStyleChange={(next) => setProp((props: Record<string, any>) => { props.style = next })}
      hideCustomCodeButton
      alwaysBare
      zIndex={zIndex}
      onBringToFront={() => reorderZIndex(query, actions, id, 'forward')}
      onSendToBack={() => reorderZIndex(query, actions, id, 'backward')}
      query={query}
      headerActions={
        <button type="button" className="block-quick-menu-item" onClick={openModal}>
          Edit HTML/CSS{allowCustomScripts ? '/JS' : ''}
        </button>
      }
      onGeometryChange={(geometry) => applyGeometry(setProp, geometry)}
      onRemove={() => actions.delete(id)}
    >
      <div className="custom-html-block">
        <iframe
          className={`custom-html-frame${editMode ? '' : ' custom-html-frame-bare'}`}
          sandbox={allowCustomScripts ? 'allow-scripts' : ''}
          srcDoc={srcDoc}
          title="Custom HTML block preview"
        />
      </div>
      {modalOpen &&
        createPortal(
          <>
            <div className="block-style-backdrop" onClick={() => setModalOpen(false)} />
            <div className="custom-html-modal-wrap">
              <div
                className="custom-html-modal"
                onPointerDown={(e) => e.stopPropagation()}
                style={{ transform: `translate3d(${offset.dx}px, ${offset.dy}px, 0)` }}
              >
                <div className="block-style-panel-header" {...dragHandleProps}>
                  <span>Edit HTML/CSS{allowCustomScripts ? '/JS' : ''}</span>
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label="Close code editor"
                  >
                    ×
                  </button>
                </div>
                <textarea
                  className="custom-html-modal-editor"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  autoFocus
                  placeholder="<div style=&quot;color: hotpink&quot;>Hello!</div>"
                />
                <div className="custom-html-modal-actions">
                  <button type="button" className="block-style-full-button" onClick={() => setModalOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="block-style-full-button confirm-popover-primary"
                    onClick={saveModal}
                  >
                    Save & preview
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}
    </BlockShell>
  )
}

CustomHtmlBlock.craft = {
  displayName: 'CustomHtmlBlock',
  props: { x: 40, y: 400, width: 340, height: 240, html: '', style: {}, zIndex: 0 },
}
