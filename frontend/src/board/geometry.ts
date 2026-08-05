export interface Geometry {
  x: number
  y: number
  width: number
  height: number
}

export type DeviceMode = 'desktop' | 'mobile'

type SetProp = (cb: (props: Record<string, any>) => void, throttleRate?: number) => void

export const DESKTOP_BOARD_WIDTH = 1440
export const DESKTOP_BOARD_HEIGHT = 900
export const MOBILE_BOARD_WIDTH = 390
export const MOBILE_BOARD_HEIGHT = 1600

export function boardWidthFor(device: DeviceMode): number {
  return device === 'mobile' ? MOBILE_BOARD_WIDTH : DESKTOP_BOARD_WIDTH
}

export function boardHeightFor(device: DeviceMode): number {
  return device === 'mobile' ? MOBILE_BOARD_HEIGHT : DESKTOP_BOARD_HEIGHT
}

export const GRID_SIZE = 20
export const MIN_BLOCK_WIDTH = GRID_SIZE
export const MIN_BLOCK_HEIGHT = GRID_SIZE

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

const GEOMETRY_HISTORY_THROTTLE_MS = 500

export function applyGeometry(setProp: SetProp, geometry: Geometry) {
  setProp((props) => {
    props.x = geometry.x
    props.y = geometry.y
    props.width = geometry.width
    props.height = geometry.height
  }, GEOMETRY_HISTORY_THROTTLE_MS)
}
