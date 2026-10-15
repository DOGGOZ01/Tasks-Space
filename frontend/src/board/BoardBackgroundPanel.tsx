import { useRef, useState } from 'react'
import type { ChangeEvent, HTMLAttributes } from 'react'
import { apiFetch, ApiError } from '../lib/api'
import type { BoardBackground, BoardBackgroundImageFit, BoardBackgroundType } from './boardBackground'
import { BACKGROUND_PRESET_COLORS } from './boardBackground'
import { CustomCssButton } from './CustomCssButton'
import { resolveThemeColor } from './themeColor'

interface UploadedImageResponse {
  id: number
  url: string
}

interface BoardBackgroundPanelProps {
  background: BoardBackground
  onChange: (next: BoardBackground) => void
  onClose: () => void
  dragHandleProps?: HTMLAttributes<HTMLDivElement>
}

const TYPE_LABELS: Record<Exclude<BoardBackgroundType, 'custom'>, string> = {
  color: 'Color',
  image: 'Image',
  html: 'Animated',
}

export function BoardBackgroundPanel({
  background,
  onChange,
  onClose,
  dragHandleProps,
}: BoardBackgroundPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setType(type: BoardBackgroundType) {
    onChange({ ...background, type })
  }

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
      onChange({ ...background, type: 'image', imageUrl: uploaded.url })
    } catch (err) {
      setError(err instanceof ApiError ? 'Upload failed. Check the file type/size.' : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="board-bg-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="block-style-panel-header" {...dragHandleProps}>
        <span>Board background</span>
        <button
          type="button"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Close background panel"
        >
          ×
        </button>
      </div>

      <div className="board-bg-type-tabs" role="tablist">
        {(Object.keys(TYPE_LABELS) as Exclude<BoardBackgroundType, 'custom'>[]).map((type) => (
          <button
            key={type}
            type="button"
            role="tab"
            aria-selected={background.type === type}
            onClick={() => setType(type)}
          >
            {TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      {background.type === 'color' && (
        <>
          <div className="board-bg-swatches">
            {BACKGROUND_PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className="board-bg-swatch"
                style={{ background: color }}
                aria-label={`Use ${color} as background`}
                aria-pressed={background.color === color}
                onClick={() => onChange({ ...background, type: 'color', color })}
              />
            ))}
          </div>
          <label className="block-style-row">
            <span className="block-style-label">Custom color</span>
            <div className="block-style-control">
              <input
                type="color"
                value={background.color ?? resolveThemeColor('--bg')}
                onChange={(e) => onChange({ ...background, type: 'color', color: e.target.value })}
              />
            </div>
          </label>
        </>
      )}

      {background.type === 'image' && (
        <>
          <div className="board-bg-image-preview">
            {background.imageUrl ? (
              <img src={background.imageUrl} alt="" />
            ) : (
              <span className="board-bg-image-placeholder">No image yet</span>
            )}
          </div>
          <div className="block-style-control">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading...' : background.imageUrl ? 'Replace image' : 'Upload image'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={handleFileChange}
              hidden
            />
          </div>
          {error && <p className="image-block-error">{error}</p>}
          <label className="block-style-row">
            <span className="block-style-label">Fit</span>
            <div className="block-style-control">
              <select
                value={background.imageFit ?? 'cover'}
                onChange={(e) =>
                  onChange({ ...background, imageFit: e.target.value as BoardBackgroundImageFit })
                }
              >
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
                <option value="repeat">Repeat / tile</option>
              </select>
            </div>
          </label>
        </>
      )}

      {background.type !== 'html' && (
        <CustomCssButton
          className="block-style-full-button"
          value={background.customCss ?? ''}
          onChange={(customCss) => onChange({ ...background, customCss })}
        />
      )}

      {background.type === 'html' && (
        <>
          <p className="board-bg-html-hint">
            Sandboxed HTML/CSS shown behind all blocks, like a Custom HTML block. &lt;script&gt;
            tags run only if scripts are enabled on the server.
          </p>
          <CustomCssButton
            className="block-style-full-button"
            label="Edit HTML/JS"
            value={background.html ?? ''}
            onChange={(html) => onChange({ ...background, type: 'html', html })}
            placeholder='<div style="color:#0ff">Hello</div><script>/* runs if enabled */</script>'
          />
        </>
      )}

    </div>
  )
}
