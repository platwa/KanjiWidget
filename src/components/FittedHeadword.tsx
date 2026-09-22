import { useLayoutEffect, useRef } from 'react'

/** Keep the preferred font size for short words, shrink longer words to the available width. */
export function FittedHeadword({ text, className, sizeKey }: { text: string; className: string; sizeKey?: string }) {
  const container = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const box = container.current
    const word = content.current
    if (!box || !word) return
    let disposed = false
    const fit = () => {
      if (disposed) return
      word.style.fontSize = '1em'
      const width = word.getBoundingClientRect().width
      if (width > box.clientWidth && box.clientWidth > 0) {
        word.style.fontSize = `${box.clientWidth / width}em`
      }
    }
    fit()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    observer?.observe(box)
    void document.fonts?.ready.then(fit)
    window.addEventListener('resize', fit)
    return () => {
      disposed = true
      observer?.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [text, sizeKey])

  return <div ref={container} className={`${className} fitted-headword`} lang="ja"><span ref={content}>{text}</span></div>
}
