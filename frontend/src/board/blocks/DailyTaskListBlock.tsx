import { useEditor, useNode } from '@craftjs/core'
import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { BlockShell } from '../BlockShell'
import type { BlockStyle } from '../blockStyle'
import { useBoardUi } from '../BoardUiContext'
import { formatDisplayDate } from '../dateFormat'
import { isDailyDateLocked, useAllowedTodayKey } from '../dayLock'
import type { ElementLayout } from '../elementLayout'
import { applyGeometry } from '../geometry'
import { useTaskBoard } from '../TaskBoardContext'
import { reorderZIndex } from '../zOrder'
import { TaskInputStylePanel, TaskInputStyleTrigger, useTaskInputStylePanel } from './TaskInputStyleButton'
import { TaskListAddRow, TaskListBody } from './TaskListView'
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
  const { dailyTasks, setDailyTasksForDate } = useTaskBoard()
  const { dayLock } = useAuth()
  const { dateFormat } = useBoardUi()
  const [dateKey, setDateKey] = useState(todayKey)
  const [draft, setDraft] = useState('')
  const inputStylePanel = useTaskInputStylePanel()

  const allowedToday = useAllowedTodayKey(dayLock)
  const locked = isDailyDateLocked(dateKey, allowedToday)
  const tasks = dailyTasks[dateKey] ?? []

  function updateTasks(next: Task[]) {
    setDailyTasksForDate(dateKey, next)
  }

  return (
    <>
      <BlockShell
        nodeId={id}
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
        extraActions={(closeMenu, menuToggleRef) => (
          <TaskInputStyleTrigger
            onClick={() => {
              closeMenu()
              inputStylePanel.open(menuToggleRef.current?.getBoundingClientRect())
            }}
          />
        )}
        elementLayout={elementLayout}
        onElementLayoutChange={(next) => setProp((props: Record<string, any>) => { props.elementLayout = next }, 500)}
        bodyLabel="Tasks"
        zIndex={zIndex}
        onBringToFront={() => reorderZIndex(query, actions, id, 'forward')}
        onSendToBack={() => reorderZIndex(query, actions, id, 'backward')}
        query={query}
        addRowSlot={
          locked ? (
            <div className="task-list-locked-note">This day is locked. No new tasks.</div>
          ) : (
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
          )
        }
        onGeometryChange={(geometry) => applyGeometry(setProp, geometry)}
        onRemove={() => actions.delete(id)}
      >
        <TaskListBody
          label={formatDisplayDate(dateKey, dateFormat)}
          tasks={tasks}
          onToggle={(taskId) =>
            updateTasks(tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)))
          }
          onRemoveTask={(taskId) => updateTasks(tasks.filter((t) => t.id !== taskId))}
          onPrev={() => setDateKey((d) => addDays(d, -1))}
          onNext={() => setDateKey((d) => addDays(d, 1))}
        />
      </BlockShell>
      {inputStylePanel.anchor && (
        <TaskInputStylePanel
          anchor={inputStylePanel.anchor}
          target={inputStylePanel.target}
          onTargetChange={inputStylePanel.setTarget}
          offset={inputStylePanel.offset}
          dragHandleProps={inputStylePanel.dragHandleProps}
          onClose={inputStylePanel.close}
          inputStyle={inputStyle}
          onInputStyleChange={(next) => setProp((props: Record<string, any>) => { props.inputStyle = next })}
          buttonStyle={addButtonStyle}
          onButtonStyleChange={(next) => setProp((props: Record<string, any>) => { props.addButtonStyle = next })}
          buttonIcon={addButtonIcon}
          onButtonIconChange={(next) => setProp((props: Record<string, any>) => { props.addButtonIcon = next })}
        />
      )}
    </>
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
    elementLayout: {},
    zIndex: 0,
  },
}
