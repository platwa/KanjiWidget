import type { Language } from '../i18n'

export function reviewReminderStatus(lastCompleted: string | null, language: Language, now = Date.now()) {
  const timestamp = lastCompleted ? Date.parse(lastCompleted) : NaN
  if (!Number.isFinite(timestamp)) return {
    due: true,
    text: language === 'ru' ? 'Вы ещё не завершили тест по этой колоде.' : 'You have not completed a review for this deck yet.',
  }
  const hours = Math.max(0, Math.floor((now - timestamp) / 3_600_000))
  const relative = hours === 0
    ? language === 'ru' ? 'менее часа назад' : 'less than an hour ago'
    : new Intl.RelativeTimeFormat(language, { numeric: 'always' }).format(-hours, 'hour')
  return {
    due: now - timestamp > 86_400_000,
    text: language === 'ru' ? `Последний тест по этой колоде завершён ${relative}.` : `Last review for this deck completed ${relative}.`,
  }
}
