import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { apiFetch } from '../lib/api'
import type { Task, TasksByDate } from './blocks/taskListHelpers'

interface TaskBoardResponse {
  daily_tasks: TasksByDate
  weekly_tasks: TasksByDate
  updated_at: string
}

interface TaskBoardValue {
  dailyTasks: TasksByDate
  weeklyTasks: TasksByDate
  setDailyTasksForDate: (dateKey: string, tasks: Task[]) => void
  setWeeklyTasksForDate: (dateKey: string, tasks: Task[]) => void
}

const TaskBoardContext = createContext<TaskBoardValue | null>(null)

const SAVE_DEBOUNCE_MS = 800

export function TaskBoardProvider({ children }: { children: ReactNode }) {
  const [dailyTasks, setDailyTasks] = useState<TasksByDate>({})
  const [weeklyTasks, setWeeklyTasks] = useState<TasksByDate>({})
  const dailyRef = useRef(dailyTasks)
  const weeklyRef = useRef(weeklyTasks)
  const saveTimeoutRef = useRef<number | null>(null)
  dailyRef.current = dailyTasks
  weeklyRef.current = weeklyTasks

  useEffect(() => {
    let cancelled = false
    apiFetch<TaskBoardResponse>('/api/tasks/')
      .then((data) => {
        if (cancelled) return
        setDailyTasks(data.daily_tasks ?? {})
        setWeeklyTasks(data.weekly_tasks ?? {})
      })
      .catch(() => {
        // Leave the empty defaults in place
      })
    return () => {
      cancelled = true
    }
  }, [])

  const scheduleSave = useCallback(() => {
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = window.setTimeout(() => {
      apiFetch('/api/tasks/', {
        method: 'PATCH',
        body: JSON.stringify({
          daily_tasks: dailyRef.current,
          weekly_tasks: weeklyRef.current,
        }),
      }).catch(() => {})
    }, SAVE_DEBOUNCE_MS)
  }, [])

  const setDailyTasksForDate = useCallback(
    (dateKey: string, tasks: Task[]) => {
      setDailyTasks((prev) => {
        const next = { ...prev, [dateKey]: tasks }
        dailyRef.current = next
        return next
      })
      scheduleSave()
    },
    [scheduleSave],
  )

  const setWeeklyTasksForDate = useCallback(
    (dateKey: string, tasks: Task[]) => {
      setWeeklyTasks((prev) => {
        const next = { ...prev, [dateKey]: tasks }
        weeklyRef.current = next
        return next
      })
      scheduleSave()
    },
    [scheduleSave],
  )

  return (
    <TaskBoardContext.Provider
      value={{ dailyTasks, weeklyTasks, setDailyTasksForDate, setWeeklyTasksForDate }}
    >
      {children}
    </TaskBoardContext.Provider>
  )
}

export function useTaskBoard(): TaskBoardValue {
  const ctx = useContext(TaskBoardContext)
  if (!ctx) throw new Error('useTaskBoard must be used within TaskBoardProvider')
  return ctx
}
