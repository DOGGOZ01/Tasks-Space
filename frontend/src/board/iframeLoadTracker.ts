import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

let pendingCount = 0
const listeners = new Set<() => void>()

function changePending(delta: number) {
  pendingCount += delta
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getPendingCount() {
  return pendingCount
}

export function usePendingIframeCount(): number {
  return useSyncExternalStore(subscribe, getPendingCount, getPendingCount)
}

export function useIframeLoadTracking(active: boolean, url: string | null, settled: boolean): () => void {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const isPending = active && (!settled || (url !== null && loadedUrl !== url))

  useEffect(() => {
    if (!isPending) return
    changePending(1)
    return () => changePending(-1)
  }, [isPending])

  return useCallback(() => setLoadedUrl(url), [url])
}
