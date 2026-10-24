import { useEditor, useNode } from '@craftjs/core'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { BlockShell } from '../BlockShell'
import type { BlockStyle } from '../blockStyle'
import { useBoardUi } from '../BoardUiContext'
import { useAuth } from '../../context/AuthContext'
import { applyGeometry } from '../geometry'
import { useTaskBoard } from '../TaskBoardContext'
import { useDragOffset } from '../useDragOffset'
import { useIframeLoadTracking } from '../iframeLoadTracker'
import { useRenderPreview } from '../useRenderPreviewUrl'
import { reorderZIndex } from '../zOrder'
import { startOfWeekKey, todayKey } from './taskListHelpers'

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

  const { url: previewUrl, settled: previewSettled } = useRenderPreview(html, 'html_block', {
    taskData: { dailyTasks, weeklyTasks, todayKey: todayKey(), startOfWeekKey: startOfWeekKey() },
  })
  const handleFrameLoad = useIframeLoadTracking(Boolean(html), previewUrl, previewSettled)

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
      extraActions={(closeMenu) => (
        <button
          type="button"
          className="block-quick-menu-item"
          onClick={() => {
            closeMenu()
            openModal()
          }}
        >
          Edit HTML/CSS{allowCustomScripts ? '/JS' : ''}
        </button>
      )}
      onGeometryChange={(geometry) => applyGeometry(setProp, geometry)}
      onRemove={() => actions.delete(id)}
    >
      <div className="custom-html-block">
        {previewUrl && (
          <iframe
            className={`custom-html-frame${editMode ? '' : ' custom-html-frame-bare'}`}
            sandbox={allowCustomScripts ? 'allow-scripts' : ''}
            src={previewUrl}
            onLoad={handleFrameLoad}
            title="Custom HTML block preview"
          />
        )}
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
