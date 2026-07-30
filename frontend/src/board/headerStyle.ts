import type { BlockStyle } from './blockStyle'

export type HeaderStyleTarget = 'edit' | 'logout' | 'username'

export type HeaderStyle = Partial<Record<HeaderStyleTarget, BlockStyle>>

export const DEFAULT_HEADER_STYLE: HeaderStyle = {}

export const HEADER_STYLE_TARGETS: { key: HeaderStyleTarget; label: string }[] = [
  { key: 'edit', label: 'Edit' },
  { key: 'logout', label: 'Log out' },
  { key: 'username', label: 'Username' },
]
