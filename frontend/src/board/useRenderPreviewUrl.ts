import { useEffect, useRef, useState } from 'react'
import { API_BASE, apiFetch } from '../lib/api'

export type RenderPreviewKind = 'html_block' | 'background' | 'overlay'

interface UseRenderPreviewUrlOptions {
  taskData?: Record<string, unknown>
  debounceMs?: number
  enabled?: boolean
}

export function useRenderPreviewUrl(
  html: string,
  kind: RenderPreviewKind,
  options: UseRenderPreviewUrlOptions = {},
): string | null {
  const { taskData, debounceMs = 400, enabled = true } = options
  const taskDataKey = taskData !== undefined ? JSON.stringify(taskData) : ''
  const taskDataRef = useRef(taskData)
  taskDataRef.current = taskData
  const [url, setUrl] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!enabled || !html) {
      setUrl(null)
      return
    }
    const requestId = ++requestIdRef.current
    const timer = window.setTimeout(() => {
      const body: Record<string, unknown> = { html, kind }
      if (taskDataRef.current !== undefined) body.taskData = taskDataRef.current
      apiFetch<{ token: string }>('/api/render-preview/', {
        method: 'POST',
        body: JSON.stringify(body),
      })
        .then(({ token }) => {
          if (requestIdRef.current !== requestId) return
          setUrl(`${API_BASE}/api/render-preview/?token=${encodeURIComponent(token)}`)
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return
          setUrl(null)
        })
    }, debounceMs)
    return () => window.clearTimeout(timer)
  }, [html, kind, taskDataKey, debounceMs, enabled])

  return url
}
