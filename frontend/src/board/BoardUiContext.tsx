import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { BoardBackground } from './boardBackground'
import type { DeviceMode } from './geometry'
import { boardHeightFor, boardWidthFor } from './geometry'
import type { HeaderStyle } from './headerStyle'

interface BoardUiValue {
  editMode: boolean
  toggleEditMode: () => void
  scale: number
  setScale: (scale: number) => void
  device: DeviceMode
  setDevice: (device: DeviceMode) => void
  canEditDesktop: boolean
  canvasWidth: number
  canvasHeight: number
  background: BoardBackground
  setBackground: (background: BoardBackground) => void
  headerStyle: HeaderStyle
  setHeaderStyle: (style: HeaderStyle) => void
}

const BoardUiContext = createContext<BoardUiValue | null>(null)

interface BoardUiProviderProps {
  children: ReactNode
  editMode: boolean
  toggleEditMode: () => void
  device: DeviceMode
  onDeviceChange: (device: DeviceMode) => void
  canEditDesktop: boolean
  background: BoardBackground
  onBackgroundChange: (background: BoardBackground) => void
  headerStyle: HeaderStyle
  onHeaderStyleChange: (style: HeaderStyle) => void
}

export function BoardUiProvider({
  children,
  editMode,
  toggleEditMode,
  device,
  onDeviceChange,
  canEditDesktop,
  background,
  onBackgroundChange,
  headerStyle,
  onHeaderStyleChange,
}: BoardUiProviderProps) {
  const [scale, setScale] = useState(1)

  const value = useMemo<BoardUiValue>(
    () => ({
      editMode,
      toggleEditMode,
      scale,
      setScale,
      device,
      setDevice: onDeviceChange,
      canEditDesktop,
      canvasWidth: boardWidthFor(device),
      canvasHeight: boardHeightFor(device),
      background,
      setBackground: onBackgroundChange,
      headerStyle,
      setHeaderStyle: onHeaderStyleChange,
    }),
    [
      editMode,
      toggleEditMode,
      scale,
      device,
      onDeviceChange,
      canEditDesktop,
      background,
      onBackgroundChange,
      headerStyle,
      onHeaderStyleChange,
    ],
  )

  return <BoardUiContext.Provider value={value}>{children}</BoardUiContext.Provider>
}

export function useBoardUi(): BoardUiValue {
  const ctx = useContext(BoardUiContext)
  if (!ctx) throw new Error('useBoardUi must be used within BoardUiProvider')
  return ctx
}
