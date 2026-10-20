import { describe, expect, it } from 'vitest'
import { reviewReminderStatus } from './reviewReminder'

describe('review reminder timing', () => {
  const now = Date.parse('2026-10-20T12:00:00Z')
  it('reminds only after more than 24 hours, including across a restart', () => {
    expect(reviewReminderStatus('2026-10-19T12:00:00Z', 'en', now).due).toBe(false)
    expect(reviewReminderStatus('2026-10-19T11:59:59Z', 'en', now).due).toBe(true)
    expect(reviewReminderStatus('2026-10-20T11:00:00Z', 'ru', now).text).toContain('1 час назад')
    expect(reviewReminderStatus('2026-10-19T10:00:00Z', 'ru', now).text).toContain('26 часов назад')
  })
  it('handles a first review, invalid dates, and a clock moving backwards', () => {
    expect(reviewReminderStatus(null, 'ru', now).due).toBe(true)
    expect(reviewReminderStatus('invalid', 'en', now).due).toBe(true)
    expect(reviewReminderStatus('2026-10-21T12:00:00Z', 'en', now).due).toBe(false)
  })
})
