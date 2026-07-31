import { ROOT_NODE, useEditor } from '@craftjs/core'
import { useRef } from 'react'
import type { ReactElement } from 'react'
import { CustomHtmlBlock } from './blocks/CustomHtmlBlock'
import { useBoardUi } from './BoardUiContext'
import { DailyTaskListBlock } from './blocks/DailyTaskListBlock'
import { clamp } from './geometry'
import { ImageBlock } from './blocks/ImageBlock'
import { NoteBlock } from './blocks/NoteBlock'
import { OverdueTaskListBlock } from './blocks/OverdueTaskListBlock'
import { WeeklyTaskListBlock } from './blocks/WeeklyTaskListBlock'

const PALETTE: Array<{ label: string; render: () => ReactElement }> = [
  { label: 'Daily tasks', render: () => <DailyTaskListBlock /> },
  { label: 'Weekly tasks', render: () => <WeeklyTaskListBlock /> },
  { label: 'Overdue', render: () => <OverdueTaskListBlock /> },
  { label: 'Note', render: () => <NoteBlock /> },
  { label: 'Image', render: () => <ImageBlock /> },
  { label: 'Custom HTML', render: () => <CustomHtmlBlock /> },
]

const CASCADE_STEP = 28
const CASCADE_MAX = 8

export function Toolbox() {
  const { actions, query } = useEditor()
  const { canvasWidth, canvasHeight } = useBoardUi()
  const addedCount = useRef(0)

  function addBlock(render: () => ReactElement) {
    const tree = query.parseReactElement(render()).toNodeTree()
    const offset = (addedCount.current % CASCADE_MAX) * CASCADE_STEP
    addedCount.current += 1

    const rootNode = tree.nodes[tree.rootNodeId]
    const props = rootNode.data.props
    const width = (props.width as number) ?? 0
    const height = (props.height as number) ?? 0
    props.x = clamp(((props.x as number) ?? 0) + offset, 0, Math.max(0, canvasWidth - width))
    props.y = clamp(((props.y as number) ?? 0) + offset, 0, Math.max(0, canvasHeight - height))

    actions.addNodeTree(tree, ROOT_NODE)
  }

  return (
    <aside className="board-toolbox">
      <h2>Add block</h2>
      {PALETTE.map((item) => (
        <button key={item.label} type="button" onClick={() => addBlock(item.render)}>
          {item.label}
        </button>
      ))}
    </aside>
  )
}
