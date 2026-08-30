import { describe, expect, it } from 'vitest'
import { parseAnkiFurigana } from './ruby'

describe('Anki furigana parser', () => {
  it('keeps kana as text and places readings above kanji groups', () => {
    expect(parseAnkiFurigana('日本[にほん]へ行[い]きます。')).toEqual([
      { text: '日本', reading: 'にほん' },
      { text: 'へ' },
      { text: '行', reading: 'い' },
      { text: 'きます。' },
    ])
  })
})
