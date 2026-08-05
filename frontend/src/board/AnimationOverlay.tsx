import DOMPurify from 'dompurify'
import { useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { API_BASE } from '../lib/api'

const OVERLAY_FORBID_TAGS = ['iframe', 'object', 'embed', 'link', 'meta', 'form']
const OVERLAY_IFRAME_CSP = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: ${API_BASE};`

const BRIDGE_SCRIPT = `<script>
window.addEventListener('message', function (e) {
  if (!e.data || e.data.source !== 'board-overlay-trigger') return;
  window.dispatchEvent(new CustomEvent('board:trigger', { detail: { event: e.data.event, active: e.data.active } }));
});
</script>`

function hashString(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return hash.toString(36)
}

function buildOverlaySrcDoc(html: string): string {
  const safe = DOMPurify.sanitize(html, {
    FORBID_TAGS: OVERLAY_FORBID_TAGS,
    ADD_TAGS: ['script'],
    FORCE_BODY: true,
    FORBID_ATTR: ['srcdoc'],
  })
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${OVERLAY_IFRAME_CSP}"><style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent;}</style>${BRIDGE_SCRIPT}</head><body>${safe}</body></html>`
}

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
}

export function AnimationOverlay({ html, targetRef }: AnimationOverlayProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const srcDoc = useMemo(() => (html ? buildOverlaySrcDoc(html) : ''), [html])

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

  if (!html) return null

  return (
    <iframe
      key={hashString(srcDoc)}
      ref={iframeRef}
      className="block-animation-overlay"
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      title="Animation overlay"
    />
  )
}
