export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1'
export type ThemeMode = 'dark' | 'light' | 'auto'
export type DisplayMode = 'full' | 'quiz'
export type FontSize = 'sm' | 'md' | 'lg'
export type QuestionType = 'kanji-meaning' | 'meaning-kanji' | 'kanji-reading' | 'onyomi-kanji'

export interface RubySegment {
  text: string
  reading?: string
}

export interface Example {
  word: string
  reading: string
  meaning_ru: string
  meaning_en: string
  sentence?: string
  sentence_ru?: string
  sentence_en?: string
  sentence_reading?: string
  ruby?: RubySegment[]
}

export interface Card {
  id: string
  kanji: string
  onyomi: string[]
  kunyomi: string[]
  furigana: string
  meaning_ru: string
  meaning_en: string
  jlpt: JlptLevel | null
  grade: number | null
  strokes: number | null
  tags: string[]
  examples: Example[]
}

export interface Deck {
  id: string
  name: string
  description: string
  level: 'N5' | 'N4' | null
  cardCount: number
  source?: 'builtin' | 'anki'
}

export type CardOrigin = 'builtin' | 'imported' | 'manual'

export interface ManagedCard {
  card: Card
  origin: CardOrigin
  modified: boolean
  hidden: boolean
}

export interface AnkiFieldMapping {
  noteTypeId: string
  headwordField: number | null
  readingField: number | null
  meaningField: number | null
  sentenceField: number | null
  sentenceReadingField: number | null
  sentenceMeaningField: number | null
}

export interface AnkiNoteTypePreview {
  id: string
  name: string
  fields: string[]
  noteCount: number
  suggested: AnkiFieldMapping
}

export interface AnkiPackagePreview {
  deckName: string
  format: string
  totalNotes: number
  noteTypes: AnkiNoteTypePreview[]
}

export interface ImportedAnkiCard {
  sourceId: string
  headword: string
  reading: string
  meaning: string
  sentence: string
  sentenceReading: string
  sentenceMeaning: string
}

export interface PersistedCardState {
  card_id: string
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last_review: string | null
}

export interface AppSettings {
  poolSize: number
  rotateIntervalSec: number
  poolRefreshTime: string
  displayMode: DisplayMode
  showOnyomi: boolean
  showKunyomi: boolean
  showFurigana: boolean
  language: 'ru' | 'en'
  theme: ThemeMode
  opacity: number
  alwaysOnTop: boolean
  autostart: boolean
  fontSize: FontSize
  deckId: string
  lockscreenExport: boolean
  lockscreenFolder: string | null
  questionTypes: QuestionType[]
  requestRetention: number
  hotkey: string
}

export interface DailyPool {
  date: string
  deckId: string
  cardIds: string[]
}

export interface ReviewSummary {
  cardId: string
  kanji: string
  rating: 1 | 2 | 3 | 4
  due: string
}
