import type { SerializedNodes } from '@craftjs/core'
import type { BoardBackground } from '../boardBackground'
import type { DeviceMode } from '../geometry'
import { boardHeightFor, boardWidthFor } from '../geometry'
import type { HeaderStyle } from '../headerStyle'
import { BLOCK_PROP_KEYS, HEADER_STYLE_BLOCK_TYPES, INPUT_STYLE_BLOCK_TYPES } from './tools'
import type { BlockTypeName } from './tools'

const CONTENT_PREVIEW_LIMIT = 300

function truncate(value: unknown): unknown {
  if (typeof value === 'string' && value.length > CONTENT_PREVIEW_LIMIT) {
    return `${value.slice(0, CONTENT_PREVIEW_LIMIT)}... (truncated, ${value.length} chars total)`
  }
  return value
}

export interface BoardStateBlockSummary {
  id: string
  type: string
  x?: number
  y?: number
  width?: number
  height?: number
  props: Record<string, unknown>
  partStyles: {
    body: Record<string, unknown>
    header?: Record<string, unknown>
    input?: Record<string, unknown>
    addButton?: Record<string, unknown>
  }
  title?: string
  addButtonIcon?: string
}

export interface BoardStateSummary {
  device: DeviceMode
  canvasWidth: number
  canvasHeight: number
  background: BoardBackground
  headerStyle: HeaderStyle
  blocks: BoardStateBlockSummary[]
}

export function summarizeBoardState(
  layout: SerializedNodes,
  device: DeviceMode,
  background: BoardBackground,
  headerStyle: HeaderStyle,
): BoardStateSummary {
  const blocks: BoardStateBlockSummary[] = Object.entries(layout)
    .filter(([id]) => id !== 'ROOT')
    .map(([id, node]) => {
      const nodeProps = (node.props ?? {}) as Record<string, unknown>
      const type = (node.type as { resolvedName?: string } | undefined)?.resolvedName ?? 'Unknown'
      const allowedKeys = BLOCK_PROP_KEYS[type as BlockTypeName] ?? []
      const props: Record<string, unknown> = {}
      for (const key of allowedKeys) {
        if (key in nodeProps) props[key] = truncate(nodeProps[key])
      }
      const summary: BoardStateBlockSummary = {
        id,
        type,
        x: nodeProps.x as number | undefined,
        y: nodeProps.y as number | undefined,
        width: nodeProps.width as number | undefined,
        height: nodeProps.height as number | undefined,
        props,
        partStyles: { body: (nodeProps.style as Record<string, unknown>) ?? {} },
      }
      if (HEADER_STYLE_BLOCK_TYPES.has(type as BlockTypeName)) {
        summary.partStyles.header = (nodeProps.headerStyle as Record<string, unknown>) ?? {}
        summary.title = (nodeProps.titleOverride as string) ?? ''
      }
      if (INPUT_STYLE_BLOCK_TYPES.has(type as BlockTypeName)) {
        summary.partStyles.input = (nodeProps.inputStyle as Record<string, unknown>) ?? {}
        summary.partStyles.addButton = (nodeProps.addButtonStyle as Record<string, unknown>) ?? {}
        summary.addButtonIcon = (nodeProps.addButtonIcon as string) || '+'
      }
      return summary
    })

  return {
    device,
    canvasWidth: boardWidthFor(device),
    canvasHeight: boardHeightFor(device),
    background,
    headerStyle,
    blocks,
  }
}
