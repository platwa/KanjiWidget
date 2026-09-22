import type { RubySegment } from '../domain/types'
import { parseAnkiFurigana } from './ruby'

export function RubyText({ text, segments, fallbackReading, target, showReadings = true }: {
  text: string
  segments?: RubySegment[]
  fallbackReading?: string
  target?: string
  showReadings?: boolean
}) {
  let resolved = segments?.length ? segments : parseAnkiFurigana(text)
  if (fallbackReading && !resolved.some((segment) => segment.reading)) {
    resolved = [{ text, reading: fallbackReading }]
  }
  return (
    <span className="ruby-text" aria-label={showReadings && fallbackReading ? `${text}, ${fallbackReading}` : resolved.map((segment) => segment.text).join('')}>
      {resolved.map((segment, index) => segment.reading ? (
        <ruby key={`${segment.text}-${index}`} className={target && segment.text.includes(target) ? 'target-kanji' : undefined}>
          {segment.text}<rp aria-hidden={!showReadings}>(</rp><rt aria-hidden={!showReadings} style={showReadings ? undefined : { visibility: 'hidden' }}>{segment.reading}</rt><rp aria-hidden={!showReadings}>)</rp>
        </ruby>
      ) : <span key={`${segment.text}-${index}`} className={target && segment.text.includes(target) ? 'target-kanji' : undefined}>{segment.text}</span>)}
    </span>
  )
}
