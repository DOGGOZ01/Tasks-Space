import { useEditor, useNode } from '@craftjs/core'
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { ApiError, apiFetch } from '../../lib/api'
import { BlockShell } from '../BlockShell'
import type { BlockStyle } from '../blockStyle'
import { applyGeometry, clamp } from '../geometry'
import { anchorBelowRect } from '../popoverAnchor'
import { reorderZIndex } from '../zOrder'

interface UploadedImageResponse {
  id: number
  url: string
  width: number
  height: number
}

const FILTER_PRESETS: Record<string, string> = {
  none: 'none',
  cyberpunk: 'contrast(1.1) saturate(1.2)',
  grayscale: 'grayscale(1)',
  sepia: 'sepia(0.8)',
  vivid: 'contrast(1.2) saturate(1.4)',
  soft: 'brightness(1.05) blur(0.3px)',
}

export type ImageBlockFit = 'cover' | 'contain' | 'fill' | 'none'

const FIT_LABELS: Record<ImageBlockFit, string> = {
  cover: 'Cover',
  contain: 'Contain',
  fill: 'Stretch to fill',
  none: 'Original size',
}

const FIT_WIDTH = 260

interface ImageAdjustmentsValue {
  filter: string
  fit: ImageBlockFit
  zoom: number
  focusX: number
  focusY: number
}

function useImageAdjustmentsPanel() {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)

  function open(rect: DOMRect | null | undefined) {
    setAnchor(anchorBelowRect(rect, FIT_WIDTH))
  }

  function close() {
    setAnchor(null)
  }

  return { anchor, open, close }
}

function ImageAdjustmentsTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="block-quick-menu-item"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
    >
      Image adjustments
    </button>
  )
}

function ImageAdjustmentsPanel({
  anchor,
  value,
  onChange,
  onClose,
}: {
  anchor: { top: number; left: number }
  value: ImageAdjustmentsValue
  onChange: (patch: Partial<ImageAdjustmentsValue>) => void
  onClose: () => void
}) {
  return createPortal(
    <>
      <div className="block-style-backdrop" onClick={onClose} />
      <div
        className="block-style-panel-wrap"
        style={{ top: anchor.top, left: anchor.left }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="block-style-panel" style={{ width: FIT_WIDTH }}>
          <div className="block-style-panel-header">
            <span>Image adjustments</span>
            <button type="button" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>

          <label className="block-style-row">
            <span className="block-style-label">Filter</span>
            <div className="block-style-control">
              <select value={value.filter} onChange={(e) => onChange({ filter: e.target.value })}>
                {Object.keys(FILTER_PRESETS).map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label className="block-style-row">
            <span className="block-style-label">Fit</span>
            <div className="block-style-control">
              <select
                value={value.fit}
                onChange={(e) => onChange({ fit: e.target.value as ImageBlockFit })}
              >
                {(Object.keys(FIT_LABELS) as ImageBlockFit[]).map((key) => (
                  <option key={key} value={key}>
                    {FIT_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label className="block-style-row">
            <span className="block-style-label">Zoom</span>
            <div className="block-style-control">
              <input
                type="range"
                min={100}
                max={400}
                value={Math.round(value.zoom * 100)}
                onChange={(e) => onChange({ zoom: Number(e.target.value) / 100 })}
              />
              <span className="block-style-value">{Math.round(value.zoom * 100)}%</span>
            </div>
          </label>

          <label className="block-style-row">
            <span className="block-style-label">Focus X</span>
            <div className="block-style-control">
              <input
                type="range"
                min={0}
                max={100}
                value={value.focusX}
                onChange={(e) => onChange({ focusX: Number(e.target.value) })}
              />
              <span className="block-style-value">{value.focusX}%</span>
            </div>
          </label>

          <label className="block-style-row">
            <span className="block-style-label">Focus Y</span>
            <div className="block-style-control">
              <input
                type="range"
                min={0}
                max={100}
                value={value.focusY}
                onChange={(e) => onChange({ focusY: Number(e.target.value) })}
              />
              <span className="block-style-value">{value.focusY}%</span>
            </div>
          </label>
        </div>
      </div>
    </>,
    document.body,
  )
}

export function ImageBlock() {
  const {
    id,
    connectors: { connect },
    x,
    y,
    width,
    height,
    imageUrl,
    filter,
    imageFit,
    imageZoom,
    imageFocusX,
    imageFocusY,
    style,
    zIndex,
    actions: { setProp },
  } = useNode((node) => ({
    x: node.data.props.x as number,
    y: node.data.props.y as number,
    width: node.data.props.width as number,
    height: node.data.props.height as number,
    imageUrl: (node.data.props.imageUrl ?? '') as string,
    filter: (node.data.props.filter ?? 'none') as string,
    imageFit: (node.data.props.imageFit ?? 'contain') as ImageBlockFit,
    imageZoom: (node.data.props.imageZoom ?? 1) as number,
    imageFocusX: (node.data.props.imageFocusX ?? 50) as number,
    imageFocusY: (node.data.props.imageFocusY ?? 50) as number,
    style: (node.data.props.style ?? {}) as BlockStyle,
    zIndex: (node.data.props.zIndex ?? 0) as number,
  }))
  const fit = imageFit
  const zoom = clamp(imageZoom, 1, 4)
  const focusX = clamp(imageFocusX, 0, 100)
  const focusY = clamp(imageFocusY, 0, 100)
  const { actions, query } = useEditor()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const adjustmentsPanel = useImageAdjustmentsPanel()

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const uploaded = await apiFetch<UploadedImageResponse>('/api/uploads/images/', {
        method: 'POST',
        body: formData,
      })
      setProp((props: Record<string, any>) => {
        props.imageUrl = uploaded.url
      })
    } catch (err) {
      setError(err instanceof ApiError ? 'Upload failed. Check the file type/size.' : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <BlockShell
        nodeId={id}
        craftRef={connect}
        title="Image"
        decorative
        x={x}
        y={y}
        width={width}
        height={height}
        style={style}
        onStyleChange={(next) => setProp((props: Record<string, any>) => { props.style = next })}
        zIndex={zIndex}
        onBringToFront={() => reorderZIndex(query, actions, id, 'forward')}
        onSendToBack={() => reorderZIndex(query, actions, id, 'backward')}
        query={query}
        extraActions={(closeMenu, menuToggleRef) => (
          <>
            <button
              type="button"
              className="block-quick-menu-item"
              onClick={() => {
                closeMenu()
                fileInputRef.current?.click()
              }}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : imageUrl ? 'Replace image' : 'Upload image'}
            </button>
            <ImageAdjustmentsTrigger
              onClick={() => {
                closeMenu()
                adjustmentsPanel.open(menuToggleRef.current?.getBoundingClientRect())
              }}
            />
          </>
        )}
        onGeometryChange={(geometry) => applyGeometry(setProp, geometry)}
        onRemove={() => actions.delete(id)}
      >
        <div className="image-block">
          <div className="image-block-preview">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                className="image-block-img"
                style={{
                  filter: FILTER_PRESETS[filter] ?? 'none',
                  objectFit: fit,
                  objectPosition: `${focusX}% ${focusY}%`,
                  transform: zoom !== 1 ? `scale(${zoom})` : undefined,
                  transformOrigin: `${focusX}% ${focusY}%`,
                }}
                draggable={false}
              />
            ) : (
              <div className="image-block-placeholder">No image yet</div>
            )}
          </div>
          {error && <p className="image-block-error">{error}</p>}
        </div>
      </BlockShell>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={handleFileChange}
        hidden
      />
      {adjustmentsPanel.anchor && (
        <ImageAdjustmentsPanel
          anchor={adjustmentsPanel.anchor}
          value={{ filter, fit, zoom, focusX, focusY }}
          onChange={(patch) =>
            setProp((props: Record<string, any>) => {
              if (patch.filter !== undefined) props.filter = patch.filter
              if (patch.fit !== undefined) props.imageFit = patch.fit
              if (patch.zoom !== undefined) props.imageZoom = patch.zoom
              if (patch.focusX !== undefined) props.imageFocusX = patch.focusX
              if (patch.focusY !== undefined) props.imageFocusY = patch.focusY
            })
          }
          onClose={adjustmentsPanel.close}
        />
      )}
    </>
  )
}

ImageBlock.craft = {
  displayName: 'ImageBlock',
  props: {
    x: 380,
    y: 40,
    width: 240,
    height: 240,
    imageUrl: '',
    filter: 'none',
    imageFit: 'contain',
    imageZoom: 1,
    imageFocusX: 50,
    imageFocusY: 50,
    style: {},
    zIndex: 0,
  },
}
