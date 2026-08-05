import type { CSSProperties } from 'react'

export type BlockElementId = 'header' | 'body' | 'addRow'

export interface ElementRect {
  x: number
  y: number
  width: number
  height: number
  hidden?: boolean
}

export type ElementLayout = Partial<Record<BlockElementId, ElementRect>>

export const DEFAULT_ELEMENT_LAYOUT: ElementLayout = {}

export const ELEMENT_LABELS: Record<BlockElementId, string> = {
  header: 'Header',
  body: 'Content',
  addRow: 'Add row',
}

const HEADER_AND_BODY_DEFAULT: ElementLayout = {
  header: { x: 0, y: 0, width: 100, height: 20 },
  body: { x: 0, y: 20, width: 100, height: 80 },
}

const WITH_ADD_ROW_DEFAULT: ElementLayout = {
  header: { x: 0, y: 0, width: 100, height: 16 },
  body: { x: 0, y: 16, width: 100, height: 64 },
  addRow: { x: 0, y: 80, width: 100, height: 20 },
}

export function defaultElementLayout(elements: BlockElementId[]): ElementLayout {
  const base = elements.includes('addRow') ? WITH_ADD_ROW_DEFAULT : HEADER_AND_BODY_DEFAULT
  const seeded: ElementLayout = {}
  for (const id of elements) {
    seeded[id] = { ...base[id] } as ElementRect
  }
  return seeded
}

export function hasCustomLayoutFor(layout: ElementLayout | undefined, elements: BlockElementId[]): boolean {
  if (!layout) return false
  return elements.length > 0 && elements.every((id) => layout[id] != null)
}

export function resolveElementRect(rect: ElementRect | undefined): CSSProperties {
  if (!rect) return {}
  if (rect.hidden) return { display: 'none' }
  return {
    position: 'absolute',
    left: `${rect.x}%`,
    top: `${rect.y}%`,
    width: `${rect.width}%`,
    height: `${rect.height}%`,
  }
}

export const ELEMENT_GRID_STEP = 2
export const MIN_ELEMENT_PERCENT = 5

export function snapPercent(value: number): number {
  return Math.round(value / ELEMENT_GRID_STEP) * ELEMENT_GRID_STEP
}

export function clampPercent(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

export function rectsOverlap(a: ElementRect, b: ElementRect): boolean {
  if (a.hidden || b.hidden) return false
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}
