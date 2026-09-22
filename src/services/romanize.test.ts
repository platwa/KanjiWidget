import { describe, expect, it } from 'vitest'
import { romanizeKana } from './romanize'

describe('modified Hepburn romanization', () => {
  it.each([
    ['ねこ', 'neko'], ['がっこう', 'gakkō'], ['とうきょう', 'tōkyō'],
    ['しんよう', "shin'yō"], ['まっちゃ', 'matcha'], ['コンピューター', 'konpyūtā'],
    ['ありがとう', 'arigatō'], ['せんせい', 'sensei'], ['見える', ''],
  ])('romanizes %s as %s', (reading, expected) => {
    expect(romanizeKana(reading)).toBe(expected)
  })
})
