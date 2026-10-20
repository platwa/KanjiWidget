import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './defaults'
import { normalizeSettings } from './settings'

describe('persisted settings validation', () => {
  it('defaults to active recall and reminders without overriding saved preferences', () => {
    expect(normalizeSettings({}).displayMode).toBe('active-recall')
    expect(normalizeSettings({}).reviewReminder).toBe(true)
    expect(normalizeSettings({ displayMode: 'full', reviewReminder: false })).toMatchObject({ displayMode: 'full', reviewReminder: false })
  })
  it('recovers missing and invalid settings without breaking the daily boundary', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings({ poolRefreshTime: '', language: 'xx', showFurigana: 'false', questionTypes: null })).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings({ poolRefreshTime: '24:99', rotateIntervalSec: NaN, requestRetention: Infinity })).toEqual(DEFAULT_SETTINGS)
  })
  it('bounds numeric values and preserves supported preferences', () => {
    const result = normalizeSettings({ poolSize: 4.9, opacity: 0, requestRetention: 2, language: 'ru', poolRefreshTime: '00:00' })
    expect(result.poolSize).toBe(4)
    expect(result.opacity).toBe(0.5)
    expect(result.requestRetention).toBe(0.99)
    expect(result.language).toBe('ru')
    expect(result.poolRefreshTime).toBe('00:00')
  })
})
