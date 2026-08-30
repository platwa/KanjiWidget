import cardsJson from '../data/cards.generated.json'
import { DEFAULT_SETTINGS, DECKS } from '../domain/defaults'
import type {
  AppSettings, Card, DailyPool, Deck, ImportedAnkiCard, ManagedCard, PersistedCardState,
} from '../domain/types'
import { createNewState, reviewState } from './scheduler'
import { emitAppEvent, isTauri } from './platform'

const cards = cardsJson as Card[]
const cardMap = new Map(cards.map((card) => [card.id, card]))
const SETTINGS_KEY = 'kanjiwidget:settings'
const STATES_KEY = 'kanjiwidget:states'
const POOLS_KEY = 'kanjiwidget:pools'
const CUSTOM_DECKS_KEY = 'kanjiwidget:custom-decks'
const CARD_OVERRIDES_KEY = 'kanjiwidget:card-overrides'

interface CustomDeckRecord {
  id: string
  name: string
  description: string
  cards: Card[]
  importedAt: string
}

interface CardOverrideRecord {
  deckId: string
  cardId: string
  card: Card | null
  hidden: boolean
  created: boolean
  updatedAt: string
}

type SqlDatabase = {
  execute: (query: string, bindValues?: unknown[]) => Promise<{ rowsAffected: number }>
  select: <T>(query: string, bindValues?: unknown[]) => Promise<T>
}

let databasePromise: Promise<SqlDatabase> | null = null

function storageAvailable() {
  return typeof localStorage !== 'undefined'
}

async function getDatabase() {
  if (!isTauri()) return null
  if (!databasePromise) {
    databasePromise = (async () => {
      const { default: Database } = await import('@tauri-apps/plugin-sql')
      const database = (await Database.load('sqlite:kanjiwidget.db')) as SqlDatabase
      await database.execute(`CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL
      )`)
      await database.execute(`CREATE TABLE IF NOT EXISTS card_states (
        card_id TEXT PRIMARY KEY, due TEXT NOT NULL, stability REAL NOT NULL,
        difficulty REAL NOT NULL, elapsed_days INTEGER NOT NULL, scheduled_days INTEGER NOT NULL,
        learning_steps INTEGER NOT NULL DEFAULT 0, reps INTEGER NOT NULL, lapses INTEGER NOT NULL,
        state INTEGER NOT NULL, last_review TEXT
      )`)
      await database.execute(`CREATE TABLE IF NOT EXISTS daily_pools (
        pool_key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
      )`)
      await database.execute(`CREATE TABLE IF NOT EXISTS review_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, card_id TEXT NOT NULL, rating INTEGER NOT NULL,
        reviewed_at TEXT NOT NULL, due TEXT NOT NULL
      )`)
      await database.execute(`CREATE TABLE IF NOT EXISTS custom_decks (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
        cards TEXT NOT NULL, imported_at TEXT NOT NULL
      )`)
      await database.execute(`CREATE TABLE IF NOT EXISTS deck_card_overrides (
        deck_id TEXT NOT NULL, card_id TEXT NOT NULL, card TEXT,
        hidden INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL, PRIMARY KEY (deck_id, card_id)
      )`)
      return database
    })()
  }
  return databasePromise
}

function readLocal<T>(key: string, fallback: T): T {
  if (!storageAvailable()) return fallback
  const value = localStorage.getItem(key)
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function todayKey(settings: AppSettings, now = new Date()) {
  const [hours, minutes] = settings.poolRefreshTime.split(':').map(Number)
  const boundary = new Date(now)
  boundary.setHours(hours, minutes, 0, 0)
  if (now < boundary) boundary.setDate(boundary.getDate() - 1)
  return `${settings.deckId}:${boundary.getFullYear()}-${String(boundary.getMonth() + 1).padStart(2, '0')}-${String(boundary.getDate()).padStart(2, '0')}`
}

export function getAllCards() {
  return cards
}

export function getCard(cardId: string) {
  return cardMap.get(cardId)
}

function getBuiltInCardsForDeck(deckId: string) {
  const deck = DECKS.find((item) => item.id === deckId)
  return deck ? cards.filter((card) => card.jlpt === deck.level) : []
}

async function loadCustomDecks(): Promise<CustomDeckRecord[]> {
  const database = await getDatabase()
  if (!database) return readLocal<CustomDeckRecord[]>(CUSTOM_DECKS_KEY, [])
  const rows = await database.select<Array<{
    id: string
    name: string
    description: string
    cards: string
    imported_at: string
  }>>('SELECT id, name, description, cards, imported_at FROM custom_decks ORDER BY imported_at DESC')
  return rows.flatMap((row) => {
    try {
      return [{ id: row.id, name: row.name, description: row.description, cards: JSON.parse(row.cards) as Card[], importedAt: row.imported_at }]
    } catch {
      return []
    }
  })
}

async function loadCardOverrides(deckId?: string): Promise<CardOverrideRecord[]> {
  const database = await getDatabase()
  if (!database) {
    const records = readLocal<CardOverrideRecord[]>(CARD_OVERRIDES_KEY, [])
    return deckId ? records.filter((record) => record.deckId === deckId) : records
  }
  const rows = await database.select<Array<{
    deck_id: string
    card_id: string
    card: string | null
    hidden: number
    created: number
    updated_at: string
  }>>(
    `SELECT deck_id, card_id, card, hidden, created, updated_at FROM deck_card_overrides
     ${deckId ? 'WHERE deck_id = $1' : ''} ORDER BY updated_at DESC`,
    deckId ? [deckId] : [],
  )
  return rows.flatMap((row) => {
    try {
      return [{
        deckId: row.deck_id,
        cardId: row.card_id,
        card: row.card ? JSON.parse(row.card) as Card : null,
        hidden: Boolean(row.hidden),
        created: Boolean(row.created),
        updatedAt: row.updated_at,
      }]
    } catch {
      return []
    }
  })
}

async function saveCardOverride(record: CardOverrideRecord) {
  const database = await getDatabase()
  if (!database) {
    const records = await loadCardOverrides()
    const next = [record, ...records.filter((item) => item.deckId !== record.deckId || item.cardId !== record.cardId)]
    localStorage.setItem(CARD_OVERRIDES_KEY, JSON.stringify(next))
    return
  }
  await database.execute(
    `INSERT INTO deck_card_overrides (deck_id, card_id, card, hidden, created, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT(deck_id, card_id) DO UPDATE SET card=excluded.card, hidden=excluded.hidden,
     created=excluded.created, updated_at=excluded.updated_at`,
    [record.deckId, record.cardId, record.card ? JSON.stringify(record.card) : null,
      Number(record.hidden), Number(record.created), record.updatedAt],
  )
}

async function removeCardOverride(deckId: string, cardId: string) {
  const database = await getDatabase()
  if (!database) {
    const records = await loadCardOverrides()
    localStorage.setItem(CARD_OVERRIDES_KEY, JSON.stringify(
      records.filter((record) => record.deckId !== deckId || record.cardId !== cardId),
    ))
    return
  }
  await database.execute('DELETE FROM deck_card_overrides WHERE deck_id = $1 AND card_id = $2', [deckId, cardId])
}

async function getBaseDeckCards(deckId: string): Promise<{ cards: Card[]; origin: 'builtin' | 'imported' }> {
  const builtIn = getBuiltInCardsForDeck(deckId)
  if (builtIn.length || DECKS.some((deck) => deck.id === deckId)) return { cards: builtIn, origin: 'builtin' }
  const custom = (await loadCustomDecks()).find((deck) => deck.id === deckId)
  if (custom) return { cards: custom.cards, origin: 'imported' }
  return { cards: getBuiltInCardsForDeck(DEFAULT_SETTINGS.deckId), origin: 'builtin' }
}

export async function getManagedCardsForDeck(deckId: string, includeHidden = true): Promise<ManagedCard[]> {
  const base = await getBaseDeckCards(deckId)
  const overrides = await loadCardOverrides(deckId)
  const overrideMap = new Map(overrides.map((record) => [record.cardId, record]))
  const result: ManagedCard[] = base.cards.flatMap((card) => {
    const override = overrideMap.get(card.id)
    overrideMap.delete(card.id)
    if (override?.hidden && !includeHidden) return []
    return [{
      card: override?.card ?? card,
      origin: base.origin,
      modified: Boolean(override?.card),
      hidden: Boolean(override?.hidden),
    }]
  })
  for (const override of overrideMap.values()) {
    if (!override.created || !override.card || (override.hidden && !includeHidden)) continue
    result.push({ card: override.card, origin: 'manual', modified: true, hidden: override.hidden })
  }
  return result
}

export async function getDecks(): Promise<Deck[]> {
  const custom = await loadCustomDecks()
  const deckList: Deck[] = [
    ...DECKS,
    ...custom.map((deck) => ({
      id: deck.id,
      name: deck.name,
      description: deck.description,
      level: null,
      cardCount: deck.cards.length,
      source: 'anki' as const,
    })),
  ]
  return Promise.all(deckList.map(async (deck) => {
    const cardCount = (await getManagedCardsForDeck(deck.id, false)).length
    return {
      ...deck,
      cardCount,
      description: deck.source === 'anki' ? `${cardCount} карточек · импортировано из .apkg` : deck.description,
    }
  }))
}

export async function getCardsForDeck(deckId: string) {
  return (await getManagedCardsForDeck(deckId, false)).map((entry) => entry.card)
}

function importedCardKey(card: ImportedAnkiCard) {
  return `${card.headword.trim()}\u0000${card.reading.trim()}`
}

function createDeckId() {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `anki-${id}`
}

export async function saveImportedDeck(name: string, imported: ImportedAnkiCard[]) {
  const records = await loadCustomDecks()
  const existing = records.find((deck) => deck.name.toLocaleLowerCase() === name.toLocaleLowerCase())
  const deckId = existing?.id ?? createDeckId()
  const uniqueIncoming = new Map<string, ImportedAnkiCard>()
  for (const card of imported) {
    const key = importedCardKey(card)
    const previous = uniqueIncoming.get(key)
    const completeness = (value: ImportedAnkiCard) =>
      [value.meaning, value.sentence, value.sentenceReading, value.sentenceMeaning]
        .reduce((score, field) => score + (field.trim() ? 1 : 0), 0)
    if (!previous || completeness(card) > completeness(previous)) uniqueIncoming.set(key, card)
  }
  const cards = [...uniqueIncoming.values()].map<Card>((card) => ({
    id: `${deckId}:${card.sourceId}`,
    kanji: card.headword,
    onyomi: [],
    kunyomi: [],
    furigana: card.reading,
    meaning_ru: card.meaning || 'Без перевода',
    meaning_en: card.meaning || 'No translation',
    jlpt: null,
    grade: null,
    strokes: null,
    tags: ['Anki'],
    examples: card.sentence ? [{
      word: card.headword,
      reading: card.reading,
      meaning_ru: '',
      meaning_en: '',
      sentence: card.sentence,
      sentence_reading: card.sentenceReading,
      sentence_ru: card.sentenceMeaning,
      sentence_en: card.sentenceMeaning,
    }] : [],
  }))
  const record: CustomDeckRecord = {
    id: deckId,
    name: name.trim() || 'Импорт Anki',
    description: `${cards.length} карточек · импортировано из .apkg`,
    cards,
    importedAt: new Date().toISOString(),
  }
  const database = await getDatabase()
  if (!database) {
    const next = [record, ...records.filter((deck) => deck.id !== deckId)]
    localStorage.setItem(CUSTOM_DECKS_KEY, JSON.stringify(next))
  } else {
    await database.execute(
      `INSERT INTO custom_decks (id, name, description, cards, imported_at) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description,
       cards=excluded.cards, imported_at=excluded.imported_at`,
      [record.id, record.name, record.description, JSON.stringify(record.cards), record.importedAt],
    )
  }
  await emitAppEvent('kanjiwidget:pool-changed')
  return { deck: { ...record, level: null, cardCount: cards.length, source: 'anki' as const }, imported: cards.length, skipped: imported.length - uniqueIncoming.size }
}

export async function deleteCustomDeck(deckId: string) {
  const database = await getDatabase()
  const cardIds = (await getManagedCardsForDeck(deckId, true)).map((entry) => entry.card.id)
  if (!database) {
    const next = (await loadCustomDecks()).filter((deck) => deck.id !== deckId)
    localStorage.setItem(CUSTOM_DECKS_KEY, JSON.stringify(next))
    const overrides = (await loadCardOverrides()).filter((record) => record.deckId !== deckId)
    localStorage.setItem(CARD_OVERRIDES_KEY, JSON.stringify(overrides))
    const states = readLocal<Record<string, PersistedCardState>>(STATES_KEY, {})
    cardIds.forEach((id) => delete states[id])
    localStorage.setItem(STATES_KEY, JSON.stringify(states))
    const pools = readLocal<Record<string, DailyPool>>(POOLS_KEY, {})
    Object.keys(pools).filter((key) => key.startsWith(`${deckId}:`)).forEach((key) => delete pools[key])
    localStorage.setItem(POOLS_KEY, JSON.stringify(pools))
  } else {
    await database.execute('DELETE FROM custom_decks WHERE id = $1', [deckId])
    await database.execute('DELETE FROM deck_card_overrides WHERE deck_id = $1', [deckId])
    await database.execute('DELETE FROM card_states WHERE card_id LIKE $1', [`${deckId}:%`])
    await database.execute('DELETE FROM review_logs WHERE card_id LIKE $1', [`${deckId}:%`])
    await database.execute('DELETE FROM daily_pools WHERE pool_key LIKE $1', [`${deckId}:%`])
  }
  await emitAppEvent('kanjiwidget:pool-changed')
}

export async function loadSettings(): Promise<AppSettings> {
  const database = await getDatabase()
  if (!database) return { ...DEFAULT_SETTINGS, ...readLocal<Partial<AppSettings>>(SETTINGS_KEY, {}) }
  const rows = await database.select<Array<{ value: string }>>('SELECT value FROM app_settings WHERE id = 1')
  if (!rows.length) return DEFAULT_SETTINGS
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(rows[0].value) as Partial<AppSettings>) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function saveSettings(settings: AppSettings) {
  const database = await getDatabase()
  if (!database) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } else {
    await database.execute(
      'INSERT INTO app_settings (id, value) VALUES (1, $1) ON CONFLICT(id) DO UPDATE SET value = excluded.value',
      [JSON.stringify(settings)],
    )
  }
  await emitAppEvent('kanjiwidget:settings-changed')
}

export async function loadAllStates(): Promise<Map<string, PersistedCardState>> {
  const database = await getDatabase()
  if (!database) {
    const local = readLocal<Record<string, PersistedCardState>>(STATES_KEY, {})
    return new Map(Object.entries(local))
  }
  const rows = await database.select<PersistedCardState[]>('SELECT * FROM card_states')
  return new Map(rows.map((state) => [state.card_id, state]))
}

export async function getOrCreateState(cardId: string) {
  const states = await loadAllStates()
  return states.get(cardId) ?? createNewState(cardId)
}

async function saveState(state: PersistedCardState) {
  const database = await getDatabase()
  if (!database) {
    const states = readLocal<Record<string, PersistedCardState>>(STATES_KEY, {})
    states[state.card_id] = state
    localStorage.setItem(STATES_KEY, JSON.stringify(states))
    return
  }
  await database.execute(
    `INSERT INTO card_states
      (card_id, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT(card_id) DO UPDATE SET due=excluded.due, stability=excluded.stability,
      difficulty=excluded.difficulty, elapsed_days=excluded.elapsed_days,
      scheduled_days=excluded.scheduled_days, learning_steps=excluded.learning_steps,
      reps=excluded.reps, lapses=excluded.lapses, state=excluded.state,
      last_review=excluded.last_review`,
    [state.card_id, state.due, state.stability, state.difficulty, state.elapsed_days,
      state.scheduled_days, state.learning_steps, state.reps, state.lapses, state.state, state.last_review],
  )
}

async function readPool(key: string): Promise<DailyPool | null> {
  const database = await getDatabase()
  if (!database) return readLocal<Record<string, DailyPool>>(POOLS_KEY, {})[key] ?? null
  const rows = await database.select<Array<{ value: string }>>('SELECT value FROM daily_pools WHERE pool_key = $1', [key])
  return rows.length ? JSON.parse(rows[0].value) as DailyPool : null
}

async function writePool(key: string, pool: DailyPool) {
  const database = await getDatabase()
  if (!database) {
    const pools = readLocal<Record<string, DailyPool>>(POOLS_KEY, {})
    pools[key] = pool
    localStorage.setItem(POOLS_KEY, JSON.stringify(pools))
  } else {
    await database.execute(
      `INSERT INTO daily_pools (pool_key, value, updated_at) VALUES ($1,$2,$3)
       ON CONFLICT(pool_key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      [key, JSON.stringify(pool), new Date().toISOString()],
    )
  }
}

function createManualCardId(deckId: string) {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${deckId}:manual-${id}`
}

async function removeCardReviewData(cardId: string) {
  const database = await getDatabase()
  if (!database) {
    const states = readLocal<Record<string, PersistedCardState>>(STATES_KEY, {})
    delete states[cardId]
    localStorage.setItem(STATES_KEY, JSON.stringify(states))
    return
  }
  await database.execute('DELETE FROM card_states WHERE card_id = $1', [cardId])
  await database.execute('DELETE FROM review_logs WHERE card_id = $1', [cardId])
}

async function putCardInCurrentPool(deckId: string, cardId: string, settings: AppSettings) {
  const deckSettings = { ...settings, deckId }
  const key = todayKey(deckSettings)
  const existing = await readPool(key)
  const current = existing?.cardIds ?? (await buildDailyPool(deckSettings)).map((card) => card.id)
  const availableIds = new Set((await getCardsForDeck(deckId)).map((card) => card.id))
  const cardIds = [cardId, ...current]
    .filter((id, index, values) => availableIds.has(id) && values.indexOf(id) === index)
    .slice(0, settings.poolSize)
  await writePool(key, {
    date: key.split(':').slice(1).join(':'),
    deckId,
    cardIds,
  })
}

export async function getCurrentPoolCardIds(deckId: string, settings: AppSettings) {
  const deckSettings = { ...settings, deckId }
  const existing = await readPool(todayKey(deckSettings))
  if (existing) return existing.cardIds
  return (await buildDailyPool(deckSettings)).map((card) => card.id)
}

export async function addCardToDeck(deckId: string, input: Omit<Card, 'id'>, settings: AppSettings) {
  const headword = input.kanji.trim()
  const reading = input.furigana.trim()
  const existing = await getManagedCardsForDeck(deckId, false)
  if (existing.some((entry) => entry.card.kanji.trim() === headword && entry.card.furigana.trim() === reading)) {
    throw new Error('Карточка с таким словом и чтением уже есть в колоде')
  }
  const card: Card = { ...input, id: createManualCardId(deckId), kanji: headword, furigana: reading }
  await saveCardOverride({
    deckId,
    cardId: card.id,
    card,
    hidden: false,
    created: true,
    updatedAt: new Date().toISOString(),
  })
  await putCardInCurrentPool(deckId, card.id, settings)
  await emitAppEvent('kanjiwidget:pool-changed')
  return card
}

export async function updateCardInDeck(deckId: string, card: Card) {
  const managed = await getManagedCardsForDeck(deckId, true)
  const current = managed.find((entry) => entry.card.id === card.id)
  if (!current) throw new Error('Карточка не найдена')
  const base = (await getBaseDeckCards(deckId)).cards.find((item) => item.id === card.id)
  await saveCardOverride({
    deckId,
    cardId: card.id,
    card,
    hidden: false,
    created: !base,
    updatedAt: new Date().toISOString(),
  })
  await emitAppEvent('kanjiwidget:pool-changed')
  return card
}

export async function deleteCardFromDeck(deckId: string, cardId: string, settings: AppSettings) {
  const base = (await getBaseDeckCards(deckId)).cards.find((card) => card.id === cardId)
  if (base) {
    await saveCardOverride({
      deckId,
      cardId,
      card: null,
      hidden: true,
      created: false,
      updatedAt: new Date().toISOString(),
    })
  } else {
    await removeCardOverride(deckId, cardId)
  }
  await removeCardReviewData(cardId)
  await buildDailyPool({ ...settings, deckId }, true, new Set([cardId]))
  await emitAppEvent('kanjiwidget:pool-changed')
}

export async function restoreOriginalCard(deckId: string, cardId: string, settings: AppSettings) {
  const original = (await getBaseDeckCards(deckId)).cards.find((card) => card.id === cardId)
  if (!original) throw new Error('Оригинал карточки не найден')
  await removeCardOverride(deckId, cardId)
  await putCardInCurrentPool(deckId, cardId, settings)
  await emitAppEvent('kanjiwidget:pool-changed')
  return original
}

export async function buildDailyPool(settings: AppSettings, force = false, excludeIds: ReadonlySet<string> = new Set()): Promise<Card[]> {
  const key = todayKey(settings)
  const allDeckCards = await getCardsForDeck(settings.deckId)
  const deckCards = allDeckCards.filter((card) => !excludeIds.has(card.id))
  const states = await loadAllStates()
  const now = Date.now()
  const available = deckCards.filter((card) => {
    const state = states.get(card.id)
    return !state || new Date(state.due).getTime() <= now
  })
  const expectedSize = Math.min(settings.poolSize, available.length)
  const availableMap = new Map(available.map((card) => [card.id, card]))
  const overdue = available
    .filter((card) => states.has(card.id))
    .sort((a, b) => new Date(states.get(a.id)!.due).getTime() - new Date(states.get(b.id)!.due).getTime())
  const fresh = available.filter((card) => !states.has(card.id))
  const existing = await readPool(key)
  const existingCards = existing?.cardIds.map((id) => availableMap.get(id)).filter(Boolean) as Card[] | undefined
  const existingIds = new Set(existingCards?.map((card) => card.id) ?? [])
  const dueCardMissing = overdue.some((card) => !existingIds.has(card.id))
  if (!force && existingCards?.length === expectedSize && !dueCardMissing) return existingCards

  const unique = [...new Map([...overdue, ...(existingCards ?? []), ...fresh].map((card) => [card.id, card])).values()]
  const chosen = unique.slice(0, settings.poolSize)
  const pool: DailyPool = { date: key.split(':').slice(1).join(':'), deckId: settings.deckId, cardIds: chosen.map((card) => card.id) }
  await writePool(key, pool)
  return chosen
}

export async function buildQuizPool(settings: AppSettings): Promise<Card[]> {
  const deckCards = await getCardsForDeck(settings.deckId)
  const cardMap = new Map(deckCards.map((card) => [card.id, card]))
  const existing = await readPool(todayKey(settings))
  if (!existing) return buildDailyPool(settings)
  return existing.cardIds.map((id) => cardMap.get(id)).filter(Boolean) as Card[]
}

export async function reviewCard(cardId: string, rating: 1 | 2 | 3 | 4, settings: AppSettings) {
  const current = await getOrCreateState(cardId)
  const next = reviewState(current, rating, settings.requestRetention)
  await saveState(next)
  const database = await getDatabase()
  if (database) {
    await database.execute(
      'INSERT INTO review_logs (card_id, rating, reviewed_at, due) VALUES ($1,$2,$3,$4)',
      [cardId, rating, new Date().toISOString(), next.due],
    )
  }
  return next
}

export async function finishQuizSession(settings: AppSettings, reviewedCardIds: readonly string[]) {
  if (!reviewedCardIds.length) return
  await buildDailyPool(settings, true, new Set(reviewedCardIds))
  await emitAppEvent('kanjiwidget:pool-changed')
}

export async function resetDeckProgress(deckId: string) {
  const cardIds = (await getCardsForDeck(deckId)).map((card) => card.id)
  const database = await getDatabase()
  if (!database) {
    const states = readLocal<Record<string, PersistedCardState>>(STATES_KEY, {})
    cardIds.forEach((id) => delete states[id])
    localStorage.setItem(STATES_KEY, JSON.stringify(states))
    localStorage.removeItem(POOLS_KEY)
  } else {
    for (const id of cardIds) {
      await database.execute('DELETE FROM card_states WHERE card_id = $1', [id])
      await database.execute('DELETE FROM review_logs WHERE card_id = $1', [id])
    }
    await database.execute('DELETE FROM daily_pools WHERE pool_key LIKE $1', [`${deckId}:%`])
  }
  await emitAppEvent('kanjiwidget:pool-changed')
}

export async function getDeckProgress(deckId: string) {
  const deckCards = await getCardsForDeck(deckId)
  const states = await loadAllStates()
  const learned = deckCards.filter((card) => {
    const state = states.get(card.id)
    return state && state.reps > 0 && state.state === 2
  }).length
  const learning = deckCards.filter((card) => {
    const state = states.get(card.id)
    return state && state.reps > 0 && state.state !== 2
  }).length
  return { total: deckCards.length, learned, learning, newCount: deckCards.length - learned - learning }
}
