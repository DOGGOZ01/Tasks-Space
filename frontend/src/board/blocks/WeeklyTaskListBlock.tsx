import { useEditor, useNode } from '@craftjs/core'
import { useState } from 'react'
import { BlockShell } from '../BlockShell'
import type { BlockStyle } from '../blockStyle'
import type { ElementLayout } from '../elementLayout'
import { applyGeometry } from '../geometry'
import { useTaskBoard } from '../TaskBoardContext'
import { reorderZIndex } from '../zOrder'
import { TaskInputStyleButton } from './TaskInputStyleButton'
import { TaskListAddRow, TaskListBody } from './TaskListView'
import { addDays, startOfWeekKey, type Task } from './taskListHelpers'

export function WeeklyTaskListBlock() {
  const {
    id,
    connectors: { connect },
    x,
    y,
    width,
    height,
    style,
    headerStyle,
    titleOverride,
    inputStyle,
    addButtonStyle,
    addButtonIcon,
    elementLayout,
    zIndex,
    actions: { setProp },
  } = useNode((node) => ({
    x: node.data.props.x as number,
    y: node.data.props.y as number,
    width: node.data.props.width as number,
    height: node.data.props.height as number,
    style: (node.data.props.style ?? {}) as BlockStyle,
    headerStyle: (node.data.props.headerStyle ?? {}) as BlockStyle,
    titleOverride: (node.data.props.titleOverride ?? '') as string,
    inputStyle: (node.data.props.inputStyle ?? {}) as BlockStyle,
    addButtonStyle: (node.data.props.addButtonStyle ?? {}) as BlockStyle,
    addButtonIcon: (node.data.props.addButtonIcon ?? '') as string,
    elementLayout: (node.data.props.elementLayout ?? {}) as ElementLayout,
    zIndex: (node.data.props.zIndex ?? 0) as number,
  }))
  const { actions, query } = useEditor()
  const { weeklyTasks, setWeeklyTasksForDate } = useTaskBoard()
  const [dateKey, setDateKey] = useState(startOfWeekKey)
  const [draft, setDraft] = useState('')

  const tasks = weeklyTasks[dateKey] ?? []

  function updateTasks(next: Task[]) {
    setWeeklyTasksForDate(dateKey, next)
  }

  return (
    <BlockShell
      nodeId={id}
      craftRef={connect}
      title="Weekly tasks"
      x={x}
      y={y}
      width={width}
      height={height}
      style={style}
      onStyleChange={(next) => setProp((props: Record<string, any>) => { props.style = next })}
      titleOverride={titleOverride}
      onTitleChange={(next) => setProp((props: Record<string, any>) => { props.titleOverride = next })}
      headerStyle={headerStyle}
      onHeaderStyleChange={(next) => setProp((props: Record<string, any>) => { props.headerStyle = next })}
      headerActions={
        <TaskInputStyleButton
          inputStyle={inputStyle}
          onInputStyleChange={(next) => setProp((props: Record<string, any>) => { props.inputStyle = next })}
          buttonStyle={addButtonStyle}
          onButtonStyleChange={(next) => setProp((props: Record<string, any>) => { props.addButtonStyle = next })}
          buttonIcon={addButtonIcon}
          onButtonIconChange={(next) => setProp((props: Record<string, any>) => { props.addButtonIcon = next })}
        />
      }
      elementLayout={elementLayout}
      onElementLayoutChange={(next) => setProp((props: Record<string, any>) => { props.elementLayout = next }, 500)}
      bodyLabel="Tasks"
      zIndex={zIndex}
      onBringToFront={() => reorderZIndex(query, actions, id, 'forward')}
      onSendToBack={() => reorderZIndex(query, actions, id, 'backward')}
      query={query}
      addRowSlot={
        <TaskListAddRow
          nodeId={id}
          draft={draft}
          onDraftChange={setDraft}
          onAdd={() => {
            if (!draft.trim()) return
            updateTasks([...tasks, { id: Date.now(), text: draft.trim(), done: false }])
            setDraft('')
          }}
          inputStyle={inputStyle}
          buttonStyle={addButtonStyle}
          buttonIcon={addButtonIcon}
        />
      }
      onGeometryChange={(geometry) => applyGeometry(setProp, geometry)}
      onRemove={() => actions.delete(id)}
    >
      <TaskListBody
        label={`Week of ${dateKey}`}
        tasks={tasks}
        onToggle={(taskId) =>
          updateTasks(tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)))
        }
        onRemoveTask={(taskId) => updateTasks(tasks.filter((t) => t.id !== taskId))}
        onPrev={() => setDateKey((d) => addDays(d, -7))}
        onNext={() => setDateKey((d) => addDays(d, 7))}
      />
    </BlockShell>
  )
}

WeeklyTaskListBlock.craft = {
  displayName: 'WeeklyTaskListBlock',
  props: {
    x: 360,
    y: 40,
    width: 280,
    height: 320,
    style: {},
    headerStyle: {},
    titleOverride: '',
    inputStyle: {},
    addButtonStyle: {},
    addButtonIcon: '',
    elementLayout: {},
    zIndex: 0,
  },
}
