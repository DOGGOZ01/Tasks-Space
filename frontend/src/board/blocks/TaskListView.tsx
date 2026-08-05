import { useRef } from 'react'
import { AnimationOverlay } from '../AnimationOverlay'
import { scopeKeyFor } from '../animationCss'
import { resolveBlockStyle } from '../blockStyle'
import type { BlockStyle } from '../blockStyle'
import { useAuth } from '../../context/AuthContext'
import { ScopedAnimationStyle } from '../ScopedAnimationStyle'
import type { Task } from './taskListHelpers'

interface TaskListBodyProps {
  label: string
  tasks: Task[]
  onToggle: (taskId: number) => void
  onRemoveTask: (taskId: number) => void
  onPrev: () => void
  onNext: () => void
}

export function TaskListBody({ label, tasks, onToggle, onRemoveTask, onPrev, onNext }: TaskListBodyProps) {
  return (
    <div className="task-list-view-body">
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
    </div>
  )
}

interface TaskListAddRowProps {
  nodeId: string
  draft: string
  onDraftChange: (value: string) => void
  onAdd: () => void
  inputStyle?: BlockStyle
  buttonStyle?: BlockStyle
  buttonIcon?: string
}

export function TaskListAddRow({
  nodeId,
  draft,
  onDraftChange,
  onAdd,
  inputStyle = {},
  buttonStyle = {},
  buttonIcon,
}: TaskListAddRowProps) {
  const { allowCustomScripts } = useAuth()
  const inputScope = scopeKeyFor(nodeId, 'input')
  const buttonScope = scopeKeyFor(nodeId, 'addButton')
  const inputWrapRef = useRef<HTMLDivElement>(null)
  const buttonWrapRef = useRef<HTMLDivElement>(null)
  return (
    <form
      className="task-list-add"
      onSubmit={(e) => {
        e.preventDefault()
        onAdd()
      }}
    >
      <ScopedAnimationStyle css={inputStyle.animationCss} scopeKey={inputScope} />
      <ScopedAnimationStyle css={buttonStyle.animationCss} scopeKey={buttonScope} />
      <div ref={inputWrapRef} className="task-list-add-input-wrap">
        <input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Add a task..."
          style={resolveBlockStyle(inputStyle, false)}
          data-anim-scope={inputScope}
        />
        <AnimationOverlay html={allowCustomScripts ? inputStyle.overlayHtml : undefined} targetRef={inputWrapRef} />
      </div>
      <div ref={buttonWrapRef} className="task-list-add-button-wrap">
        <button type="submit" style={resolveBlockStyle(buttonStyle, false)} data-anim-scope={buttonScope}>
          {buttonIcon || '+'}
        </button>
        <AnimationOverlay html={allowCustomScripts ? buttonStyle.overlayHtml : undefined} targetRef={buttonWrapRef} />
      </div>
    </form>
  )
}
