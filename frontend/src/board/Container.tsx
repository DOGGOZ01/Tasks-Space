import type { ReactNode } from 'react'

interface ContainerProps {
  children?: ReactNode
}

export function Container({ children }: ContainerProps) {
  return <div className="board-canvas">{children}</div>
}

Container.craft = {
  displayName: 'Container',
  props: {},
  rules: {
    canDrag: () => false,
  },
}
