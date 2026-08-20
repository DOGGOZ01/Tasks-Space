import { useEffect, useState } from 'react'
import { addDays } from './blocks/taskListHelpers'

export type DayLockMode = 'local' | 'global'

export interface DayLockConfig {
  mode: DayLockMode
  timezone: string
}

export const DEFAULT_DAY_LOCK: DayLockConfig = { mode: 'local', timezone: 'UTC' }

const ALLOWED_TODAY_REFRESH_MS = 60_000

function formatDateInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function allowedTodayKey(config: DayLockConfig): string {
  if (config.mode === 'global') {
    return formatDateInTimeZone(new Date(Date.now() - 12 * 60 * 60 * 1000), 'UTC')
  }
  try {
    return formatDateInTimeZone(new Date(), config.timezone)
  } catch {
    return formatDateInTimeZone(new Date(), 'UTC')
  }
}

export function isDailyDateLocked(dateKey: string, allowedToday: string): boolean {
  return dateKey < allowedToday
}

export function isWeeklyDateLocked(weekKey: string, allowedToday: string): boolean {
  return addDays(weekKey, 6) < allowedToday
}

export function useAllowedTodayKey(config: DayLockConfig): string {
  const { mode, timezone } = config
  const [value, setValue] = useState(() => allowedTodayKey({ mode, timezone }))

  useEffect(() => {
    setValue(allowedTodayKey({ mode, timezone }))
    const interval = window.setInterval(
      () => setValue(allowedTodayKey({ mode, timezone })),
      ALLOWED_TODAY_REFRESH_MS,
    )
    return () => window.clearInterval(interval)
  }, [mode, timezone])

  return value
}
