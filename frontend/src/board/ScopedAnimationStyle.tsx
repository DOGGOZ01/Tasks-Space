import { scopeAnimationCss } from './animationCss'

export function ScopedAnimationStyle({ css, scopeKey }: { css: string | undefined; scopeKey: string }) {
  if (!css) return null
  return <style>{scopeAnimationCss(css, scopeKey)}</style>
}
