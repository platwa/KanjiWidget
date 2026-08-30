import type { AppSettings, Deck } from './types'

export const DECKS: Deck[] = [
  {
    id: 'jlpt-n5',
    name: 'JLPT N5',
    description: '80 базовых кандзи для начала обучения',
    level: 'N5',
    cardCount: 80,
    source: 'builtin',
  },
  {
    id: 'jlpt-n4',
    name: 'JLPT N4',
    description: '170 кандзи следующего уровня',
    level: 'N4',
    cardCount: 170,
    source: 'builtin',
  },
]

export const DEFAULT_SETTINGS: AppSettings = {
  poolSize: 10,
  rotateIntervalSec: 300,
  poolRefreshTime: '09:00',
  displayMode: 'full',
  showOnyomi: true,
  showKunyomi: true,
  showFurigana: true,
  language: 'ru',
  theme: 'dark',
  opacity: 0.92,
  alwaysOnTop: true,
  autostart: false,
  fontSize: 'md',
  deckId: 'jlpt-n5',
  lockscreenExport: false,
  lockscreenFolder: null,
  questionTypes: ['kanji-meaning', 'meaning-kanji'],
  requestRetention: 0.9,
  hotkey: 'Ctrl+Shift+J',
}

export const RATING_LABELS = {
  1: 'Снова',
  2: 'Сложно',
  3: 'Нормально',
  4: 'Легко',
} as const
