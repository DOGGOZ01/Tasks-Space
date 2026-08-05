import { useEditor, useNode } from '@craftjs/core'
import { BlockShell } from '../BlockShell'
import type { BlockStyle } from '../blockStyle'
import type { ElementLayout } from '../elementLayout'
import { applyGeometry } from '../geometry'
import { useTaskBoard } from '../TaskBoardContext'
import { reorderZIndex } from '../zOrder'
import { startOfWeekKey, todayKey, type Task, type TasksByDate } from './taskListHelpers'

type OverdueSource = 'daily' | 'weekly'

interface OverdueItem {
  task: Task
  dateKey: string
  label: string
  source: OverdueSource
}

function collectOverdueItems(dailyTasks: TasksByDate, weeklyTasks: TasksByDate): OverdueItem[] {
  const today = todayKey()
  const currentWeek = startOfWeekKey()
  const items: OverdueItem[] = []

  for (const [dateKey, tasks] of Object.entries(dailyTasks)) {
    if (dateKey >= today) continue
    for (const task of tasks) {
      if (!task.done) items.push({ task, dateKey, label: dateKey, source: 'daily' })
    }
  }

  for (const [dateKey, tasks] of Object.entries(weeklyTasks)) {
    if (dateKey >= currentWeek) continue
    for (const task of tasks) {
      if (!task.done) items.push({ task, dateKey, label: `Week of ${dateKey}`, source: 'weekly' })
    }
  }

  items.sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  return items
}

export function OverdueTaskListBlock() {
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
    elementLayout: (node.data.props.elementLayout ?? {}) as ElementLayout,
    zIndex: (node.data.props.zIndex ?? 0) as number,
  }))
  const { actions, query } = useEditor()
  const { dailyTasks, weeklyTasks, setDailyTasksForDate, setWeeklyTasksForDate } = useTaskBoard()

  const items = collectOverdueItems(dailyTasks, weeklyTasks)

  function withSourceBucket(item: OverdueItem, mutate: (tasks: Task[]) => Task[]) {
    const bucket = item.source === 'daily' ? dailyTasks : weeklyTasks
    const setter = item.source === 'daily' ? setDailyTasksForDate : setWeeklyTasksForDate
    setter(item.dateKey, mutate(bucket[item.dateKey] ?? []))
  }

  return (
    <BlockShell
      nodeId={id}
      craftRef={connect}
      title="Overdue"
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
      elementLayout={elementLayout}
      onElementLayoutChange={(next) => setProp((props: Record<string, any>) => { props.elementLayout = next }, 500)}
      bodyLabel="Tasks"
      zIndex={zIndex}
      onBringToFront={() => reorderZIndex(query, actions, id, 'forward')}
      onSendToBack={() => reorderZIndex(query, actions, id, 'backward')}
      query={query}
      onGeometryChange={(geometry) => applyGeometry(setProp, geometry)}
      onRemove={() => actions.delete(id)}
    >
      <div className="task-list-block">
        {items.length === 0 ? (
          <p className="overdue-empty">Nothing overdue.</p>
        ) : (
          <ul className="task-list-items">
            {items.map((item) => (
              <li key={`${item.source}-${item.dateKey}-${item.task.id}`}>
                <label>
                  <input
                    type="checkbox"
                    checked={item.task.done}
                    onChange={() =>
                      withSourceBucket(item, (tasks) =>
                        tasks.map((t) => (t.id === item.task.id ? { ...t, done: !t.done } : t)),
                      )
                    }
                  />
                  <span className="overdue-task-text">
                    <span className="overdue-task-primary">{item.task.text}</span>
                    <span className="overdue-task-meta">{item.label}</span>
                  </span>
                </label>
                <button
                  type="button"
                  className="task-list-remove"
                  aria-label="Remove task"
                  onClick={() =>
                    withSourceBucket(item, (tasks) => tasks.filter((t) => t.id !== item.task.id))
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BlockShell>
  )
}

OverdueTaskListBlock.craft = {
  displayName: 'OverdueTaskListBlock',
  props: {
    x: 40,
    y: 400,
    width: 280,
    height: 320,
    style: {},
    headerStyle: {},
    titleOverride: '',
    elementLayout: {},
    zIndex: 0,
  },
}
