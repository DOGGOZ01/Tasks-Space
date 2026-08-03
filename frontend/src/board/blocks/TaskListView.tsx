import { resolveBlockStyle } from '../blockStyle'
import type { BlockStyle } from '../blockStyle'
import type { Task } from './taskListHelpers'

interface TaskListViewProps {
  label: string
  tasks: Task[]
  draft: string
  onDraftChange: (value: string) => void
  onAdd: () => void
  onToggle: (taskId: number) => void
  onRemoveTask: (taskId: number) => void
  onPrev: () => void
  onNext: () => void
  inputStyle?: BlockStyle
  buttonStyle?: BlockStyle
  buttonIcon?: string
}

export function TaskListView({
  label,
  tasks,
  draft,
  onDraftChange,
  onAdd,
  onToggle,
  onRemoveTask,
  onPrev,
  onNext,
  inputStyle = {},
  buttonStyle = {},
  buttonIcon,
}: TaskListViewProps) {
  return (
    <div className="task-list-block">
      <div className="task-list-nav">
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={onPrev}>
          ‹
        </button>
        <span>{label}</span>
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={onNext}>
          ›
        </button>
      </div>
      <ul className="task-list-items">
        {tasks.map((task) => (
          <li key={task.id} className={task.done ? 'done' : ''}>
            <label>
              <input type="checkbox" checked={task.done} onChange={() => onToggle(task.id)} />
              {task.text}
            </label>
            <button
              type="button"
              className="task-list-remove"
              onClick={() => onRemoveTask(task.id)}
              aria-label="Remove task"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        className="task-list-add"
        onSubmit={(e) => {
          e.preventDefault()
          onAdd()
        }}
      >
        <input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Add a task..."
          style={resolveBlockStyle(inputStyle, false)}
        />
        <button type="submit" style={resolveBlockStyle(buttonStyle, false)}>
          {buttonIcon || '+'}
        </button>
      </form>
    </div>
  )
}
