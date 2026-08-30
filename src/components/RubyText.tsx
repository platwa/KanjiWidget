import type { RubySegment } from '../domain/types'
import { parseAnkiFurigana } from './ruby'

export function RubyText({ text, segments, fallbackReading, target }: {
  text: string
  segments?: RubySegment[]
  fallbackReading?: string
  target?: string
}) {
  let resolved = segments?.length ? segments : parseAnkiFurigana(text)
  if (fallbackReading && !resolved.some((segment) => segment.reading)) {
    resolved = [{ text, reading: fallbackReading }]
  }
  return (
    <span className="ruby-text" aria-label={fallbackReading ? `${text}, ${fallbackReading}` : text}>
      {resolved.map((segment, index) => segment.reading ? (
        <ruby key={`${segment.text}-${index}`} className={target && segment.text.includes(target) ? 'target-kanji' : undefined}>
          {segment.text}<rp>(</rp><rt>{segment.reading}</rt><rp>)</rp>
        </ruby>
      ) : <span key={`${segment.text}-${index}`} className={target && segment.text.includes(target) ? 'target-kanji' : undefined}>{segment.text}</span>)}
    </span>
  )
}
