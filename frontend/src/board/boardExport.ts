import type { SerializedNodes } from '@craftjs/core'
import { DEFAULT_BOARD_BACKGROUND } from './boardBackground'
import type { BoardBackground } from './boardBackground'
import type { DeviceMode } from './geometry'
import type { HeaderStyle } from './headerStyle'

export const EXPORT_KIND = 'task-tracker-board-design'
export const EXPORT_VERSION = 1

export interface BoardDesignExport {
  kind: typeof EXPORT_KIND
  version: typeof EXPORT_VERSION
  device: DeviceMode
  layout: SerializedNodes
  layouts?: Partial<Record<DeviceMode, SerializedNodes>>
  background: BoardBackground
  headerStyle: HeaderStyle
}

export class BoardDesignImportError extends Error {}

const IMAGE_BLOCK_NAMES = new Set(['ImageBlock'])
const MAX_IMPORT_BYTES = 3_000_000

function nodeDisplayName(node: unknown): string | undefined {
  const n = node as { type?: unknown; displayName?: unknown } | null
  if (!n) return undefined
  const type = n.type as { resolvedName?: unknown } | undefined
  if (type && typeof type === 'object' && typeof type.resolvedName === 'string') {
    return type.resolvedName
  }
  return typeof n.displayName === 'string' ? n.displayName : undefined
}

function stripImageUrls(layout: SerializedNodes): SerializedNodes {
  const cloned = JSON.parse(JSON.stringify(layout ?? {})) as SerializedNodes
  for (const node of Object.values(cloned)) {
    const n = node as { props?: Record<string, unknown> } | null
    if (!n || typeof n !== 'object') continue
    if (IMAGE_BLOCK_NAMES.has(nodeDisplayName(n) ?? '') && n.props) {
      n.props.imageUrl = ''
    }
  }
  return cloned
}

function stripBackgroundImage(background: BoardBackground): BoardBackground {
  if (!background || background.type !== 'image') return background ?? {}
  const { imageUrl: _imageUrl, ...rest } = background
  return rest
}

export function buildBoardDesignExport(
  device: DeviceMode,
  layout: SerializedNodes,
  background: BoardBackground,
  headerStyle: HeaderStyle,
  options: { stripImages?: boolean } = {},
): BoardDesignExport {
  const stripImages = options.stripImages ?? true
  return {
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    device,
    layout: stripImages ? stripImageUrls(layout) : (JSON.parse(JSON.stringify(layout ?? {})) as SerializedNodes),
    background: stripImages ? stripBackgroundImage(background) : { ...(background ?? {}) },
    headerStyle: headerStyle ?? {},
  }
}

export function downloadBoardDesignExport(data: BoardDesignExport) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `tasks-space-${data.device}-design.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function parseBoardDesignImport(raw: string): BoardDesignExport {
  if (raw.length > MAX_IMPORT_BYTES) {
    throw new BoardDesignImportError('That file is too large.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new BoardDesignImportError("That file isn't valid JSON.")
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new BoardDesignImportError("That file isn't a Tasks Space design export.")
  }
  const data = parsed as Partial<BoardDesignExport>
  const layouts: Partial<Record<DeviceMode, SerializedNodes>> = {}
  if (data.layouts && typeof data.layouts === 'object') {
    for (const key of ['desktop', 'mobile'] as const) {
      const value = (data.layouts as Record<string, unknown>)[key]
      if (value && typeof value === 'object') layouts[key] = stripImageUrls(value as SerializedNodes)
    }
  }
  const mainLayout = data.layout && typeof data.layout === 'object' ? data.layout : layouts.desktop ?? layouts.mobile
  if (data.kind !== EXPORT_KIND || !mainLayout) {
    throw new BoardDesignImportError("That file isn't a Tasks Space design export.")
  }

  return {
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    device: data.device === 'mobile' ? 'mobile' : 'desktop',
    layout: stripImageUrls(mainLayout),
    ...(Object.keys(layouts).length ? { layouts } : {}),
    background:
      data.background && typeof data.background === 'object'
        ? stripBackgroundImage(data.background)
        : DEFAULT_BOARD_BACKGROUND,
    headerStyle: data.headerStyle && typeof data.headerStyle === 'object' ? data.headerStyle : {},
  }
}
