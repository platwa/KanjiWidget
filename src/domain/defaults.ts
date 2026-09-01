import type { AppSettings, Deck } from './types'

export const DECKS: Deck[] = [
  {
    id: 'jlpt-n5',
    name: 'JLPT N5',
    description: '80 essential kanji for beginners',
    level: 'N5',
    cardCount: 80,
    source: 'builtin',
  },
  {
    id: 'jlpt-n4',
    name: 'JLPT N4',
    description: '170 kanji for the next level',
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
  language: 'en',
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
