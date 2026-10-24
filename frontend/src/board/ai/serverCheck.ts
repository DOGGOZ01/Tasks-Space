import { apiFetch } from '../../lib/api'
import type { ApplyResult, SanitizeCheck } from './applyToolCalls'
import type { ToolResultEntry } from './types'

const CHECK_BATCH_SIZE = 40

interface CheckReport {
  dropped_tags: string[]
  dropped_properties: string[]
  dropped_selectors: string[]
  truncated: boolean
}

export const SERVER_DROP_PREFIX = 'Applied, but the server will drop'

function describeReport(label: string, report: CheckReport): string | null {
  const parts: string[] = []
  if (report.dropped_properties.length) parts.push(`properties ${report.dropped_properties.join(', ')}`)
  if (report.dropped_selectors.length) parts.push(`selectors ${report.dropped_selectors.join(', ')}`)
  if (report.dropped_tags.length) parts.push(`tags ${report.dropped_tags.map((t) => `<${t}>`).join(', ')}`)
  if (report.truncated) parts.push('everything past the length limit')
  return parts.length ? `${label}: ${parts.join('; ')}` : null
}

export async function toToolResults(results: ApplyResult[]): Promise<ToolResultEntry[]> {
  const checks: { index: number; check: SanitizeCheck }[] = results.flatMap((result, index) =>
    result.error ? [] : (result.checks ?? []).map((check) => ({ index, check })),
  )
  const notes: string[][] = results.map(() => [])

  try {
    for (let start = 0; start < checks.length; start += CHECK_BATCH_SIZE) {
      const batch = checks.slice(start, start + CHECK_BATCH_SIZE)
      const response = await apiFetch<{ results: CheckReport[] }>('/api/ai/sanitize-check/', {
        method: 'POST',
        body: JSON.stringify({ items: batch.map(({ check }) => ({ kind: check.kind, value: check.value })) }),
      })
      response.results.forEach((report, i) => {
        const note = describeReport(batch[i].check.label, report)
        if (note) notes[batch[i].index].push(note)
      })
    }
  } catch {}

  return results.map((result, index) => ({
    callId: result.toolCall.id,
    name: result.toolCall.name,
    output:
      result.error ??
      (notes[index].length
        ? `${SERVER_DROP_PREFIX} these when saving (${notes[index].join(' | ')}). Rewrite those parts ` +
          'with allowed properties and tags.'
        : 'Done.'),
    isError: Boolean(result.error),
  }))
}
