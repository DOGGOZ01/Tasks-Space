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

export function TaskBoardProvider({ children }: { children: ReactNode }) {
  const [dailyTasks, setDailyTasks] = useState<TasksByDate>({})
  const [weeklyTasks, setWeeklyTasks] = useState<TasksByDate>({})
  const dailyRef = useRef(dailyTasks)
  const weeklyRef = useRef(weeklyTasks)
  const saveControllerRef = useRef<AbortController | null>(null)
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
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const saveNow = useCallback(() => {
    saveControllerRef.current?.abort()
    const controller = new AbortController()
    saveControllerRef.current = controller
    apiFetch('/api/tasks/', {
      method: 'PATCH',
      body: JSON.stringify({
        daily_tasks: dailyRef.current,
        weekly_tasks: weeklyRef.current,
      }),
      signal: controller.signal,
    }).catch(() => {})
  }, [])

  const setDailyTasksForDate = useCallback(
    (dateKey: string, tasks: Task[]) => {
      const next = { ...dailyRef.current, [dateKey]: tasks }
      dailyRef.current = next
      setDailyTasks(next)
      saveNow()
    },
    [saveNow],
  )

  const setWeeklyTasksForDate = useCallback(
    (dateKey: string, tasks: Task[]) => {
      const next = { ...weeklyRef.current, [dateKey]: tasks }
      weeklyRef.current = next
      setWeeklyTasks(next)
      saveNow()
    },
    [saveNow],
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
