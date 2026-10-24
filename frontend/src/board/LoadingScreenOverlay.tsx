import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type { LoadingScreen } from './loadingScreen'
import { cachePreviewUrl, readCachedPreviewUrl } from './loadingScreen'
import { renderPreviewUrlForToken } from './useRenderPreviewUrl'

const FADE_OUT_MS = 400

function useLoadingScreenUrl(html: string, username: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (html ? readCachedPreviewUrl(username, html) : null))

  useEffect(() => {
    if (!html) {
      setUrl(null)
      return
    }
    const cached = readCachedPreviewUrl(username, html)
    if (cached) {
      setUrl(cached)
      return
    }
    let cancelled = false
    apiFetch<{ token: string }>('/api/render-preview/', {
      method: 'POST',
      body: JSON.stringify({ html, kind: 'background' }),
    })
      .then(({ token }) => {
        if (cancelled) return
        const next = renderPreviewUrlForToken(token)
        cachePreviewUrl(username, html, next)
        setUrl(next)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [html, username])

  return url
}

interface LoadingScreenOverlayProps {
  visible: boolean
  screen: LoadingScreen
  username?: string
  onDismiss?: () => void
}

export function LoadingScreenOverlay({ visible, screen, username, onDismiss }: LoadingScreenOverlayProps) {
  const { allowCustomScripts } = useAuth()
  const [mounted, setMounted] = useState(visible)
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const html = screen.html ?? ''
  const url = useLoadingScreenUrl(mounted ? html : '', username)

  useEffect(() => {
    if (visible) {
      setMounted(true)
      return
    }
    const timeoutId = window.setTimeout(() => setMounted(false), FADE_OUT_MS)
    return () => window.clearTimeout(timeoutId)
  }, [visible])

  if (!mounted) return null

  return (
    <div
      className={`board-initial-loading${visible ? '' : ' board-initial-loading-hidden'}`}
      style={screen.color ? { background: screen.color } : undefined}
      onClick={onDismiss}
    >
      {html ? (
        url && (
          <iframe
            className={`loading-screen-frame${loadedUrl === url ? ' loading-screen-frame-ready' : ''}`}
            sandbox={allowCustomScripts ? 'allow-scripts' : ''}
            src={url}
            onLoad={() => setLoadedUrl(url)}
            title="Loading screen"
          />
        )
      ) : (
        <>
          <div className="board-initial-loading-spinner" />
          <p>Loading your board...</p>
        </>
      )}
      {onDismiss && <p className="loading-screen-dismiss-hint">Preview. Click anywhere to close.</p>}
    </div>
  )
}
