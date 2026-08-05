import type { HTMLAttributes, ReactNode } from 'react'
import { CustomCodeButton } from './CustomCodeButton'
import { useAuth } from '../context/AuthContext'
import { STYLE_PRESETS } from './blockStyle'
import type { BlockStyle } from './blockStyle'

interface BlockStylePanelProps {
  title?: string
  style: BlockStyle
  onChange: (next: BlockStyle) => void
  onClose: () => void
  showCustomCss?: boolean
  dragHandleProps?: HTMLAttributes<HTMLDivElement>
  children?: ReactNode
}

function set<K extends keyof BlockStyle>(
  style: BlockStyle,
  onChange: (next: BlockStyle) => void,
  key: K,
  value: BlockStyle[K],
) {
  onChange({ ...style, [key]: value })
}

export function BlockStylePanel({
  title = 'Block style',
  style,
  onChange,
  onClose,
  showCustomCss = true,
  dragHandleProps,
  children,
}: BlockStylePanelProps) {
  const { allowCustomScripts } = useAuth()
  return (
    <div className="block-style-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="block-style-panel-header" {...dragHandleProps}>
        <span>{title}</span>
        <button
          type="button"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Close style panel"
        >
          ×
        </button>
      </div>

      <div className="block-style-presets">
        {STYLE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() =>
              onChange({
                ...preset.style,
                customCss: style.customCss,
                animationCss: style.animationCss,
                overlayHtml: style.overlayHtml,
              })
            }
          >
            {preset.label}
          </button>
        ))}
      </div>

      <label className="block-style-row">
        <span className="block-style-label">Background</span>
        <div className="block-style-control">
          <input
            type="color"
            value={style.background ?? '#ffffff'}
            onChange={(e) => set(style, onChange, 'background', e.target.value)}
          />
          <button type="button" onClick={() => set(style, onChange, 'background', undefined)}>
            Reset
          </button>
        </div>
      </label>

      <label className="block-style-row">
        <span className="block-style-label">Text</span>
        <div className="block-style-control">
          <input
            type="color"
            value={style.textColor ?? '#000000'}
            onChange={(e) => set(style, onChange, 'textColor', e.target.value)}
          />
          <button type="button" onClick={() => set(style, onChange, 'textColor', undefined)}>
            Reset
          </button>
        </div>
      </label>

      <label className="block-style-row">
        <span className="block-style-label">Border</span>
        <div className="block-style-control">
          <input
            type="color"
            value={style.borderColor ?? '#000000'}
            onChange={(e) => set(style, onChange, 'borderColor', e.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              onChange({ ...style, borderColor: undefined, borderWidth: undefined })
            }}
          >
            Reset
          </button>
        </div>
      </label>

      <label className="block-style-row">
        <span className="block-style-label">Border width</span>
        <div className="block-style-control">
          <input
            type="range"
            min={0}
            max={8}
            value={style.borderWidth ?? 0}
            onChange={(e) => set(style, onChange, 'borderWidth', Number(e.target.value))}
          />
          <span className="block-style-value">{style.borderWidth ?? 0}px</span>
        </div>
      </label>

      <label className="block-style-row">
        <span className="block-style-label">Corner radius</span>
        <div className="block-style-control">
          <input
            type="range"
            min={0}
            max={40}
            value={style.borderRadius ?? 8}
            onChange={(e) => set(style, onChange, 'borderRadius', Number(e.target.value))}
          />
          <span className="block-style-value">{style.borderRadius ?? 8}px</span>
        </div>
      </label>

      <label className="block-style-row">
        <span className="block-style-label">Opacity</span>
        <div className="block-style-control">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((style.opacity ?? 1) * 100)}
            onChange={(e) => set(style, onChange, 'opacity', Number(e.target.value) / 100)}
          />
          <span className="block-style-value">{Math.round((style.opacity ?? 1) * 100)}%</span>
        </div>
      </label>

      {showCustomCss && (
        <CustomCodeButton
          style={style}
          onChange={onChange}
          allowCustomScripts={allowCustomScripts}
          className="block-style-full-button"
        />
      )}

      {children}
    </div>
  )
}
