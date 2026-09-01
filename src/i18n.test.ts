import { describe, expect, it } from 'vitest'
import { cardCountLabel, localizedError, ratingLabel, tx } from './i18n'

describe('localization helpers', () => {
  it('selects copy for the active language', () => {
    expect(tx('en', 'Settings', 'Настройки')).toBe('Settings')
    expect(tx('ru', 'Settings', 'Настройки')).toBe('Настройки')
  })

  it('formats rating and card count labels', () => {
    expect(ratingLabel('en', 4)).toBe('Easy')
    expect(ratingLabel('ru', 1)).toBe('Снова')
    expect(cardCountLabel('en', 1)).toBe('1 card')
    expect(cardCountLabel('en', 4)).toBe('4 cards')
    expect(cardCountLabel('ru', 21)).toBe('21 карточка')
    expect(cardCountLabel('ru', 12)).toBe('12 карточек')
  })

  it('translates known storage errors without hiding unknown details', () => {
    expect(localizedError('en', 'Карточка не найдена')).toBe('Card not found')
    expect(localizedError('en', 'SQLite error 5')).toBe('SQLite error 5')
  })
})
