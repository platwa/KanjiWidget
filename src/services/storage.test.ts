import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../domain/defaults'
import {
  addCardToDeck, buildDailyPool, buildQuizPool, deleteCardFromDeck, deleteCustomDeck,
  finishQuizSession, getAllCards, getCardsForDeck, getCurrentPoolCardIds, getDecks,
  getManagedCardsForDeck, loadSettings, restoreOriginalCard, reviewCard, saveImportedDeck,
  saveSettings, updateCardInDeck,
} from './storage'

describe('local data and daily pool', () => {
  it('contains complete N5 and N4 decks with Russian meanings', async () => {
    expect(await getCardsForDeck('jlpt-n5')).toHaveLength(80)
    expect(await getCardsForDeck('jlpt-n4')).toHaveLength(170)
    expect(getAllCards()).toHaveLength(250)
    expect(getAllCards().every((card) => /[а-яё]/i.test(card.meaning_ru))).toBe(true)
    expect(getAllCards().every((card) => card.meaning_ru.length <= 72)).toBe(true)
    expect(getAllCards().every((card) => card.furigana && (card.onyomi.length || card.kunyomi.length))).toBe(true)
    expect(getAllCards().every((card) => {
      const example = card.examples[0]
      if (!example?.sentence || !example.ruby?.length) return false
      return example.ruby.every((segment) => !/\p{Script=Han}/u.test(segment.text) || Boolean(segment.reading))
    })).toBe(true)
    expect(getAllCards().every((card) => /[а-яё]/i.test(card.examples[0].sentence_ru ?? ''))).toBe(true)
    expect(new Set(getAllCards().map((card) => card.id)).size).toBe(250)
  })

  it('saves settings with defaults preserved', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, poolSize: 7, language: 'en' })
    const settings = await loadSettings()
    expect(settings.poolSize).toBe(7)
    expect(settings.language).toBe('en')
    expect(settings.questionTypes.length).toBeGreaterThan(0)
  })

  it('builds a stable pool and removes a rated card until it is due', async () => {
    const settings = { ...DEFAULT_SETTINGS, poolSize: 5 }
    const first = await buildDailyPool(settings)
    const second = await buildDailyPool(settings)
    expect(first.map((card) => card.id)).toEqual(second.map((card) => card.id))
    await reviewCard(first[0].id, 1, settings)
    expect((await buildQuizPool(settings)).map((card) => card.id)).toEqual(first.map((card) => card.id))
    await finishQuizSession(settings, [first[0].id])
    const updated = await buildDailyPool(settings)
    expect(updated).toHaveLength(5)
    expect(updated.some((card) => card.id === first[0].id)).toBe(false)
    const states = JSON.parse(localStorage.getItem('kanjiwidget:states') ?? '{}')
    states[first[0].id].due = new Date(Date.now() - 1_000).toISOString()
    localStorage.setItem('kanjiwidget:states', JSON.stringify(states))
    const due = await buildDailyPool(settings)
    expect(due.some((card) => card.id === first[0].id)).toBe(true)
  })

  it('imports Anki cards into a separate deck without duplicates', async () => {
    const imported = await saveImportedDeck('Моя Anki', [
      { sourceId: '1', headword: '日本', reading: 'にほん', meaning: 'Япония', sentence: '日本[にほん]へ行[い]きます。', sentenceReading: '', sentenceMeaning: 'Я еду в Японию.' },
      { sourceId: '2', headword: '日本', reading: 'にほん', meaning: 'Япония', sentence: '', sentenceReading: '', sentenceMeaning: '' },
    ])
    expect(imported.imported).toBe(1)
    expect(imported.skipped).toBe(1)
    expect((await getDecks()).find((deck) => deck.id === imported.deck.id)?.source).toBe('anki')
    const cards = await getCardsForDeck(imported.deck.id)
    expect(cards).toHaveLength(1)
    expect(cards[0].examples[0].sentence).toContain('日本[にほん]')
    await deleteCustomDeck(imported.deck.id)
    expect((await getDecks()).some((deck) => deck.id === imported.deck.id)).toBe(false)
  })

  it('keeps the quiz pool frozen until the session is finished', async () => {
    const imported = await saveImportedDeck('Тестовая колода', [
      { sourceId: 'pool-1', headword: '水', reading: 'みず', meaning: 'вода', sentence: '水[みず]を飲[の]みます。', sentenceReading: '', sentenceMeaning: 'Пью воду.' },
      { sourceId: 'pool-2', headword: '火', reading: 'ひ', meaning: 'огонь', sentence: '火[ひ]を消[け]します。', sentenceReading: '', sentenceMeaning: 'Тушу огонь.' },
    ])
    const settings = { ...DEFAULT_SETTINGS, deckId: imported.deck.id, poolSize: 1 }
    const initial = await buildQuizPool(settings)
    expect(initial).toHaveLength(1)
    let poolChanges = 0
    const handlePoolChange = () => { poolChanges += 1 }
    window.addEventListener('kanjiwidget:pool-changed', handlePoolChange)
    await reviewCard(initial[0].id, 4, settings)
    expect((await buildQuizPool(settings)).map((card) => card.id)).toEqual([initial[0].id])
    expect(poolChanges).toBe(0)
    await finishQuizSession(settings, [initial[0].id])
    const nextPool = await buildQuizPool(settings)
    expect(nextPool).toHaveLength(1)
    expect(nextPool[0].id).not.toBe(initial[0].id)
    expect(poolChanges).toBe(1)
    window.removeEventListener('kanjiwidget:pool-changed', handlePoolChange)
    await deleteCustomDeck(imported.deck.id)
  })

  it('adds a manual card directly to the selected deck pool and keeps its id while editing', async () => {
    const settings = { ...DEFAULT_SETTINGS, deckId: 'jlpt-n5', poolSize: 3 }
    await buildDailyPool(settings)
    const created = await addCardToDeck('jlpt-n5', {
      kanji: '猫', furigana: 'ねこ', meaning_ru: 'кошка', meaning_en: 'cat',
      onyomi: ['ビョウ'], kunyomi: ['ねこ'], jlpt: null, grade: null, strokes: null,
      tags: ['моя'], examples: [],
    }, settings)
    expect((await getCurrentPoolCardIds('jlpt-n5', settings))[0]).toBe(created.id)
    expect((await getManagedCardsForDeck('jlpt-n5')).find((entry) => entry.card.id === created.id)?.origin).toBe('manual')

    await updateCardInDeck('jlpt-n5', { ...created, meaning_ru: 'домашняя кошка' })
    const updated = (await getCardsForDeck('jlpt-n5')).find((card) => card.id === created.id)
    expect(updated?.meaning_ru).toBe('домашняя кошка')
    expect(updated?.id).toBe(created.id)

    await deleteCardFromDeck('jlpt-n5', created.id, settings)
    expect((await getCardsForDeck('jlpt-n5')).some((card) => card.id === created.id)).toBe(false)
    expect(await getCurrentPoolCardIds('jlpt-n5', settings)).not.toContain(created.id)
  })

  it('can edit, hide, and restore a built-in card without changing the bundled original', async () => {
    const settings = { ...DEFAULT_SETTINGS, deckId: 'jlpt-n5', poolSize: 3 }
    const original = (await getCardsForDeck('jlpt-n5'))[0]
    await updateCardInDeck('jlpt-n5', { ...original, meaning_ru: 'пользовательская правка' })
    expect((await getCardsForDeck('jlpt-n5')).find((card) => card.id === original.id)?.meaning_ru).toBe('пользовательская правка')

    await deleteCardFromDeck('jlpt-n5', original.id, settings)
    expect((await getCardsForDeck('jlpt-n5')).some((card) => card.id === original.id)).toBe(false)
    const hidden = (await getManagedCardsForDeck('jlpt-n5')).find((entry) => entry.card.id === original.id)
    expect(hidden?.hidden).toBe(true)

    await restoreOriginalCard('jlpt-n5', original.id, settings)
    const restored = (await getCardsForDeck('jlpt-n5')).find((card) => card.id === original.id)
    expect(restored?.meaning_ru).toBe(original.meaning_ru)
    expect((await getCurrentPoolCardIds('jlpt-n5', settings))[0]).toBe(original.id)
  })

  it('edits one card efficiently in a 1,300-card imported deck', async () => {
    const imported = await saveImportedDeck('Большая колода', Array.from({ length: 1_300 }, (_, index) => ({
      sourceId: `large-${index}`,
      headword: `単語${index}`,
      reading: `たんご${index}`,
      meaning: `слово ${index}`,
      sentence: '', sentenceReading: '', sentenceMeaning: '',
    })))
    expect(imported.imported).toBe(1_300)
    const entries = await getManagedCardsForDeck(imported.deck.id, false)
    expect(entries).toHaveLength(1_300)
    const target = entries[649].card
    await updateCardInDeck(imported.deck.id, { ...target, meaning_ru: 'исправленное значение' })
    expect((await getCardsForDeck(imported.deck.id))[649].meaning_ru).toBe('исправленное значение')
    expect((await getDecks()).find((deck) => deck.id === imported.deck.id)?.cardCount).toBe(1_300)
    await deleteCustomDeck(imported.deck.id)
  })
})
