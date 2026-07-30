import { useEditor, useNode } from '@craftjs/core'
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { ApiError, apiFetch } from '../../lib/api'
import { BlockShell } from '../BlockShell'
import type { BlockStyle } from '../blockStyle'
import { applyGeometry } from '../geometry'

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
    style,
    actions: { setProp },
  } = useNode((node) => ({
    x: node.data.props.x as number,
    y: node.data.props.y as number,
    width: node.data.props.width as number,
    height: node.data.props.height as number,
    imageUrl: (node.data.props.imageUrl ?? '') as string,
    filter: (node.data.props.filter ?? 'none') as string,
    style: (node.data.props.style ?? {}) as BlockStyle,
  }))
  const { actions } = useEditor()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    <BlockShell
      craftRef={connect}
      title="Image"
      decorative
      x={x}
      y={y}
      width={width}
      height={height}
      style={style}
      onStyleChange={(next) => setProp((props: Record<string, any>) => { props.style = next })}
      headerActions={
        <>
          <button
            type="button"
            className="block-quick-menu-item"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : imageUrl ? 'Replace image' : 'Upload image'}
          </button>
          <select
            className="block-quick-menu-item"
            value={filter}
            onChange={(e) =>
              setProp((props: Record<string, any>) => {
                props.filter = e.target.value
              })
            }
          >
            {Object.keys(FILTER_PRESETS).map((key) => (
              <option key={key} value={key}>
                Filter: {key}
              </option>
            ))}
          </select>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={handleFileChange}
            hidden
          />
        </>
      }
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
              style={{ filter: FILTER_PRESETS[filter] ?? 'none' }}
              draggable={false}
            />
          ) : (
            <div className="image-block-placeholder">No image yet</div>
          )}
        </div>
        {error && <p className="image-block-error">{error}</p>}
      </div>
    </BlockShell>
  )
}

ImageBlock.craft = {
  displayName: 'ImageBlock',
  props: { x: 380, y: 40, width: 240, height: 240, imageUrl: '', filter: 'none', style: {} },
}
