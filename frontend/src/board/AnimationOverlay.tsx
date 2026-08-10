import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useRenderPreviewUrl } from './useRenderPreviewUrl'

export const OVERLAY_HTML_PLACEHOLDER = `<style>.fx{width:100%;height:100%;border-radius:inherit;box-shadow:0 0 0 0 rgba(255,90,31,.6);transition:box-shadow .4s ease;}</style>
<div class="fx" id="fx"></div>
<script>
window.addEventListener('board:trigger', function (e) {
  if (e.detail.event !== 'hover') return;
  document.getElementById('fx').style.boxShadow = e.detail.active
    ? '0 0 0 10px rgba(255,90,31,0)'
    : '0 0 0 0 rgba(255,90,31,.6)';
});
</script>`

interface AnimationOverlayProps {
  html: string | undefined
  targetRef: RefObject<HTMLElement | null>
  allowScripts: boolean
}

export function AnimationOverlay({ html, targetRef, allowScripts }: AnimationOverlayProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const previewUrl = useRenderPreviewUrl(html ?? '', 'overlay', { enabled: !!html })

  useEffect(() => {
    const target = targetRef.current
    const iframe = iframeRef.current
    if (!target || !iframe || !html) return

    function send(event: string, active: boolean) {
      iframe?.contentWindow?.postMessage({ source: 'board-overlay-trigger', event, active }, '*')
    }
    const onEnter = () => send('hover', true)
    const onLeave = () => send('hover', false)
    const onDown = () => send('active', true)
    const onUp = () => send('active', false)
    const onClick = () => send('click', true)

    target.addEventListener('pointerenter', onEnter)
    target.addEventListener('pointerleave', onLeave)
    target.addEventListener('pointerdown', onDown)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('click', onClick)
    return () => {
      target.removeEventListener('pointerenter', onEnter)
      target.removeEventListener('pointerleave', onLeave)
      target.removeEventListener('pointerdown', onDown)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('click', onClick)
    }
  }, [html, targetRef])

  if (!html || !previewUrl) return null

  return (
    <iframe
      ref={iframeRef}
      className="block-animation-overlay"
      sandbox={allowScripts ? 'allow-scripts' : ''}
      src={previewUrl}
      title="Animation overlay"
    />
  )
}
