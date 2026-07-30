export interface Task {
  id: number
  text: string
  done: boolean
}

export type TasksByDate = Record<string, Task[]>

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayKey(): string {
  return formatDateKey(new Date())
}

export function startOfWeekKey(): string {
  const now = new Date()
  const isoDayIndex = (now.getDay() + 6) % 7 // Monday = 0 ... Sunday = 6
  const monday = new Date(now)
  monday.setDate(now.getDate() - isoDayIndex)
  return formatDateKey(monday)
}

export function addDays(dateKey: string, delta: number): string {
  const date = new Date(`${dateKey}T00:00:00`)
  date.setDate(date.getDate() + delta)
  return formatDateKey(date)
}
