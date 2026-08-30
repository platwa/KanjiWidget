import type { RubySegment } from '../domain/types'

const KANJI_WITH_READING = /([々〇〻㐀-鿿豈-﫿]+)\[([^\]]+)]/g

export function parseAnkiFurigana(value: string): RubySegment[] {
  const result: RubySegment[] = []
  let offset = 0
  for (const match of value.matchAll(KANJI_WITH_READING)) {
    const index = match.index ?? 0
    if (index > offset) result.push({ text: value.slice(offset, index) })
    result.push({ text: match[1], reading: match[2] })
    offset = index + match[0].length
  }
  if (offset < value.length) result.push({ text: value.slice(offset) })
  return result.length ? result : [{ text: value }]
}
