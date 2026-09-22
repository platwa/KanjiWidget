import { describe, expect, it } from 'vitest'
import {
  bugReportUrl, contactEmailUrl, isSupportReminderDue, nextSupportReminderDate,
  SUPPORT_EMAIL, SUPPORT_URL,
} from './config'
import { lockscreenFileName } from './services/platform'

describe('support and contact links', () => {
  it('uses the official Tribute page', () => {
    expect(SUPPORT_URL).toBe('https://web.tribute.tg/d/PHT')
  })

  it('builds a pre-filled localized bug report email', () => {
    const russian = decodeURIComponent(bugReportUrl('ru'))
    const english = decodeURIComponent(bugReportUrl('en'))
    expect(russian).toContain(`mailto:${SUPPORT_EMAIL}`)
    expect(russian).toContain('Что произошло:')
    expect(russian).toContain('Как повторить ошибку:')
    expect(english).toContain('What happened:')
    expect(english).toContain('Steps to reproduce:')
  })

  it('builds a usable general contact email', () => {
    expect(decodeURIComponent(contactEmailUrl('ru'))).toContain('Обратная связь по KanjiWidget')
    expect(decodeURIComponent(contactEmailUrl('en'))).toContain('KanjiWidget feedback')
  })
})

describe('lock-screen exports', () => {
  it('uses the full card id for stable, distinct file names', () => {
    expect(lockscreenFileName('deck:1:見る')).toBe(lockscreenFileName('deck:1:見る'))
    expect(lockscreenFileName('deck:1:見る')).not.toBe(lockscreenFileName('deck:2:見える'))
    expect(lockscreenFileName('deck:1:見る')).toMatch(/^kanjiwidget-[0-9a-f]{8}\.png$/)
  })
})

describe('weekly support reminder', () => {
  const now = Date.UTC(2026, 8, 1, 12)

  it('is due on the first settings visit and for invalid stored values', () => {
    expect(isSupportReminderDue(null, now)).toBe(true)
    expect(isSupportReminderDue('not-a-date', now)).toBe(true)
  })

  it('waits exactly seven days after dismissal', () => {
    const next = nextSupportReminderDate(now)
    expect(next).toBe(new Date(now + 7 * 86_400_000).toISOString())
    expect(isSupportReminderDue(next, now + 6 * 86_400_000)).toBe(false)
    expect(isSupportReminderDue(next, now + 7 * 86_400_000)).toBe(true)
  })
})
