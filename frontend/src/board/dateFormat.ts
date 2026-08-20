export type DateFormatPref = 'MDY' | 'DMY'

export const DEFAULT_DATE_FORMAT: DateFormatPref = 'MDY'

export function formatDisplayDate(dateKey: string, pref: DateFormatPref): string {
  const [year, month, day] = dateKey.split('-')
  if (!year || !month || !day) return dateKey
  return pref === 'DMY' ? `${day}.${month}.${year}` : `${month}/${day}/${year}`
}
