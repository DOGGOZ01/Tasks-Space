import type { SerializedNodes } from '@craftjs/core'

interface QueryLike {
  serialize: () => string
}

interface ActionsLike {
  setProp: (id: string, cb: (props: Record<string, unknown>) => void) => void
}

export type ZOrderDirection = 'front' | 'back' | 'forward' | 'backward'

function getSortedBlockIds(query: QueryLike): string[] {
  let nodes: SerializedNodes
  try {
    nodes = JSON.parse(query.serialize()) as SerializedNodes
  } catch {
    return []
  }

  const entries: { id: string; zIndex: number }[] = []
  for (const [id, node] of Object.entries(nodes)) {
    if (id === 'ROOT') continue
    const zIndex = (node.props as Record<string, unknown> | undefined)?.zIndex
    entries.push({ id, zIndex: typeof zIndex === 'number' && Number.isFinite(zIndex) ? zIndex : 0 })
  }
  entries.sort((a, b) => a.zIndex - b.zIndex)
  return entries.map((entry) => entry.id)
}

export function getZIndexRank(query: QueryLike, currentId: string): { rank: number; total: number } {
  const order = getSortedBlockIds(query)
  const index = order.indexOf(currentId)
  return { rank: index === -1 ? 1 : index + 1, total: order.length || 1 }
}

export function reorderZIndex(query: QueryLike, actions: ActionsLike, currentId: string, direction: ZOrderDirection): void {
  const order = getSortedBlockIds(query)
  const index = order.indexOf(currentId)
  if (index === -1) return

  let nextOrder = order
  if (direction === 'front') {
    nextOrder = [...order.slice(0, index), ...order.slice(index + 1), currentId]
  } else if (direction === 'back') {
    nextOrder = [currentId, ...order.slice(0, index), ...order.slice(index + 1)]
  } else if (direction === 'forward' && index < order.length - 1) {
    nextOrder = [...order]
    nextOrder[index] = order[index + 1]
    nextOrder[index + 1] = order[index]
  } else if (direction === 'backward' && index > 0) {
    nextOrder = [...order]
    nextOrder[index] = order[index - 1]
    nextOrder[index - 1] = order[index]
  }

  nextOrder.forEach((id, position) => {
    actions.setProp(id, (props: Record<string, unknown>) => {
      props.zIndex = position
    })
  })
}
