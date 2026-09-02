import type { Language } from './i18n'

export const APP_NAME = 'KanjiWidget'
export const APP_VERSION = '1.4.0'
export const SUPPORT_EMAIL = 'support.kanjiwidget@gmail.com'
export const SOURCE_URL = 'https://github.com/platwa/KanjiWidget'
export const ISSUES_URL = `${SOURCE_URL}/issues/new/choose`
export const SUPPORT_URL = 'https://web.tribute.tg/d/PHT'
export const SUPPORT_REMINDER_DAYS = 7
export const SUPPORT_REMINDER_KEY = 'kanjiwidget.support-reminder-next-at.v3'

export function contactEmailUrl(language: Language) {
  const subject = language === 'ru' ? 'Обратная связь по KanjiWidget' : 'KanjiWidget feedback'
  const body = language === 'ru'
    ? 'Здравствуйте!\n\n'
    : 'Hello!\n\n'
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function nextSupportReminderDate(now = Date.now()) {
  return new Date(now + SUPPORT_REMINDER_DAYS * 86_400_000).toISOString()
}

export function isSupportReminderDue(value: string | null, now = Date.now()) {
  if (!value) return true
  const timestamp = new Date(value).getTime()
  return !Number.isFinite(timestamp) || timestamp <= now
}

export function bugReportUrl(language: Language) {
  const subject = `KanjiWidget ${APP_VERSION} — ${language === 'ru' ? 'сообщение об ошибке' : 'bug report'}`
  const body = language === 'ru'
    ? `Версия KanjiWidget: ${APP_VERSION}\nВерсия Windows:\n\nЧто произошло:\n\nКак повторить ошибку:\n1. \n2. \n3. \n\nОжидаемый результат:\n`
    : `KanjiWidget version: ${APP_VERSION}\nWindows version:\n\nWhat happened:\n\nSteps to reproduce:\n1. \n2. \n3. \n\nExpected result:\n`
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
