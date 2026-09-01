import type { AppSettings } from './domain/types'

export type Language = AppSettings['language']

export function tx(language: Language, english: string, russian: string) {
  return language === 'ru' ? russian : english
}

export function numberLocale(language: Language) {
  return language === 'ru' ? 'ru-RU' : 'en-US'
}

export function cardCountLabel(language: Language, count: number) {
  if (language === 'en') return `${count.toLocaleString('en-US')} ${count === 1 ? 'card' : 'cards'}`
  const lastTwo = count % 100
  const last = count % 10
  const word = lastTwo >= 11 && lastTwo <= 14 ? 'карточек' : last === 1 ? 'карточка' : last >= 2 && last <= 4 ? 'карточки' : 'карточек'
  return `${count.toLocaleString('ru-RU')} ${word}`
}

export function ratingLabel(language: Language, rating: 1 | 2 | 3 | 4) {
  const labels = language === 'ru'
    ? { 1: 'Снова', 2: 'Сложно', 3: 'Нормально', 4: 'Легко' }
    : { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' }
  return labels[rating]
}

export function applyDocumentLanguage(language: Language) {
  document.documentElement.lang = language
}

export function localizedError(language: Language, reason: unknown) {
  const message = String(reason).replace(/^Error:\s*/, '')
  if (language === 'ru') return message
  const replacements: Array<[RegExp, string]> = [
    [/Файл Anki не найден/i, 'Anki file not found'],
    [/Поддерживаются только колоды \.apkg/i, 'Only .apkg decks are supported'],
    [/Не удалось открыть \.apkg/i, 'Could not open the .apkg file'],
    [/Повреждённый архив \.apkg/i, 'The .apkg archive is damaged'],
    [/В архиве нет коллекции Anki/i, 'No Anki collection was found in the archive'],
    [/Коллекция Anki слишком велика/i, 'The Anki collection is too large'],
    [/В \.apkg находится неподдерживаемый формат коллекции/i, 'This .apkg collection format is not supported'],
    [/В колоде нет заметок с доступными полями/i, 'The deck has no notes with readable fields'],
    [/Выберите поле с кандзи или японским словом/i, 'Choose the field containing a kanji or Japanese word'],
    [/Некорректный тип заметок Anki/i, 'Invalid Anki note type'],
    [/По выбранному сопоставлению не найдено карточек с кандзи/i, 'No kanji cards matched the selected fields'],
    [/Карточка с таким словом и чтением уже есть в колоде/i, 'A card with this word and reading already exists in the deck'],
    [/Оригинал карточки не найден/i, 'The original card could not be found'],
    [/Карточка не найдена/i, 'Card not found'],
  ]
  return replacements.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), message)
}
