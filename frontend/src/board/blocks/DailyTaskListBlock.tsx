import { useEditor, useNode } from '@craftjs/core'
import { useState } from 'react'
import { BlockShell } from '../BlockShell'
import type { BlockStyle } from '../blockStyle'
import { applyGeometry } from '../geometry'
import { useTaskBoard } from '../TaskBoardContext'
import { TaskInputStyleButton } from './TaskInputStyleButton'
import { TaskListView } from './TaskListView'
import { addDays, todayKey, type Task } from './taskListHelpers'

export function DailyTaskListBlock() {
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
  }))
  const { actions } = useEditor()
  const { dailyTasks, setDailyTasksForDate } = useTaskBoard()
  const [dateKey, setDateKey] = useState(todayKey)
  const [draft, setDraft] = useState('')

  const tasks = dailyTasks[dateKey] ?? []

  function updateTasks(next: Task[]) {
    setDailyTasksForDate(dateKey, next)
  }

  return (
    <BlockShell
      craftRef={connect}
      title="Daily tasks"
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
      onGeometryChange={(geometry) => applyGeometry(setProp, geometry)}
      onRemove={() => actions.delete(id)}
    >
      <TaskListView
        label={dateKey}
        tasks={tasks}
        draft={draft}
        onDraftChange={setDraft}
        onAdd={() => {
          if (!draft.trim()) return
          updateTasks([...tasks, { id: Date.now(), text: draft.trim(), done: false }])
          setDraft('')
        }}
        onToggle={(taskId) =>
          updateTasks(tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)))
        }
        onRemoveTask={(taskId) => updateTasks(tasks.filter((t) => t.id !== taskId))}
        onPrev={() => setDateKey((d) => addDays(d, -1))}
        onNext={() => setDateKey((d) => addDays(d, 1))}
        inputStyle={inputStyle}
        buttonStyle={addButtonStyle}
        buttonIcon={addButtonIcon}
      />
    </BlockShell>
  )
}

DailyTaskListBlock.craft = {
  displayName: 'DailyTaskListBlock',
  props: {
    x: 40,
    y: 40,
    width: 280,
    height: 320,
    style: {},
    headerStyle: {},
    titleOverride: '',
    inputStyle: {},
    addButtonStyle: {},
    addButtonIcon: '',
  },
}
