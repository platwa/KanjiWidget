import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft, ChevronRight, EyeOff, Layers3, LoaderCircle, Pencil, Plus,
  RotateCcw, Save, Search, Trash2, X,
} from 'lucide-react'
import type { AppSettings, Card, Deck, ManagedCard } from '../domain/types'
import type { Language } from '../i18n'
import { localizedError, numberLocale, tx } from '../i18n'
import {
  addCardToDeck, deleteCardFromDeck, getCurrentPoolCardIds, getManagedCardsForDeck,
  restoreOriginalCard, updateCardInDeck,
} from '../services/storage'
import { KanjiCard } from './KanjiCard'

type CardFilter = 'all' | 'pool' | 'modified' | 'hidden'
type CardDraft = {
  headword: string
  reading: string
  meaningRu: string
  meaningEn: string
  onyomi: string
  kunyomi: string
  example: string
  exampleReading: string
  exampleTranslation: string
  tags: string
}

const PAGE_SIZE = 50

const emptyDraft: CardDraft = {
  headword: '',
  reading: '',
  meaningRu: '',
  meaningEn: '',
  onyomi: '',
  kunyomi: '',
  example: '',
  exampleReading: '',
  exampleTranslation: '',
  tags: '',
}

function draftFromCard(card: Card, language: Language): CardDraft {
  const example = card.examples[0]
  return {
    headword: card.kanji,
    reading: card.furigana,
    meaningRu: card.meaning_ru,
    meaningEn: card.meaning_en,
    onyomi: card.onyomi.join('、'),
    kunyomi: card.kunyomi.join('、'),
    example: example?.sentence ?? '',
    exampleReading: example?.sentence_reading ?? '',
    exampleTranslation: (language === 'ru' ? example?.sentence_ru : example?.sentence_en) ?? '',
    tags: card.tags.join(', '),
  }
}

function splitList(value: string) {
  return value.split(/[,、;]+/).map((item) => item.trim()).filter(Boolean)
}

function cardFromDraft(draft: CardDraft, original?: Card, language: Language = 'en'): Card {
  const meaningRu = draft.meaningRu.trim() || draft.meaningEn.trim()
  const meaningEn = draft.meaningEn.trim() || meaningRu
  const headword = draft.headword.trim()
  const reading = draft.reading.trim()
  const sentence = draft.example.trim()
  const originalExample = original?.examples[0]
  const editedExample = sentence ? {
    word: headword,
    reading,
    meaning_ru: meaningRu,
    meaning_en: meaningEn,
    sentence,
    sentence_reading: draft.exampleReading.trim(),
    sentence_ru: language === 'ru' ? draft.exampleTranslation.trim() : originalExample?.sentence_ru || '',
    sentence_en: language === 'en' ? draft.exampleTranslation.trim() : originalExample?.sentence_en || '',
    ruby: originalExample?.sentence === sentence ? originalExample.ruby : undefined,
  } : null
  return {
    id: original?.id ?? 'preview',
    kanji: headword,
    furigana: reading,
    meaning_ru: meaningRu,
    meaning_en: meaningEn,
    onyomi: splitList(draft.onyomi),
    kunyomi: splitList(draft.kunyomi),
    jlpt: original?.jlpt ?? null,
    grade: original?.grade ?? null,
    strokes: original?.strokes ?? null,
    tags: splitList(draft.tags),
    examples: editedExample ? [editedExample, ...(original?.examples.slice(1) ?? [])] : [],
  }
}

function originLabel(entry: ManagedCard, language: Language) {
  if (entry.origin === 'manual') return tx(language, 'Added manually', 'Добавлена вручную')
  if (entry.origin === 'imported') return entry.modified ? tx(language, 'Edited · Anki', 'Изменена · Anki') : 'Anki'
  return entry.modified ? tx(language, 'Edited · built-in', 'Изменена · встроенная') : tx(language, 'Built-in', 'Встроенная')
}

export function CardManager({ deck, settings, initialCardId, startWithNew = false, onClose, onChanged, onNotice }: {
  deck: Deck
  settings: AppSettings
  initialCardId?: string
  startWithNew?: boolean
  onClose: () => void
  onChanged: () => void | Promise<void>
  onNotice: (message: string) => void
}) {
  const language = settings.language
  const tr = (english: string, russian: string) => tx(language, english, russian)
  const locale = numberLocale(language)
  const [entries, setEntries] = useState<ManagedCard[]>([])
  const [poolIds, setPoolIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [filter, setFilter] = useState<CardFilter>('all')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState<ManagedCard | 'new' | null>(startWithNew ? 'new' : null)

  const refresh = useCallback(async () => {
    const [nextEntries, nextPoolIds] = await Promise.all([
      getManagedCardsForDeck(deck.id, true),
      getCurrentPoolCardIds(deck.id, settings),
    ])
    setEntries(nextEntries)
    setPoolIds(new Set(nextPoolIds))
    setLoading(false)
    return nextEntries
  }, [deck.id, settings])

  useEffect(() => {
    void refresh().then((nextEntries) => {
      if (initialCardId) {
        const requested = nextEntries.find((entry) => entry.card.id === initialCardId)
        if (requested) setEditor(requested)
      }
    })
  }, [initialCardId, refresh])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (editor) setEditor(null)
      else onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editor, onClose])

  const filtered = useMemo(() => {
    const needle = deferredSearch.trim().toLocaleLowerCase()
    return entries.filter((entry) => {
      if (filter === 'all' && entry.hidden) return false
      if (filter === 'pool' && (entry.hidden || !poolIds.has(entry.card.id))) return false
      if (filter === 'modified' && (entry.hidden || (!entry.modified && entry.origin !== 'manual'))) return false
      if (filter === 'hidden' && !entry.hidden) return false
      if (!needle) return true
      const example = entry.card.examples[0]
      const haystack = [
        entry.card.kanji, entry.card.furigana, entry.card.meaning_ru, entry.card.meaning_en,
        entry.card.onyomi.join(' '), entry.card.kunyomi.join(' '), example?.sentence,
        example?.sentence_ru, entry.card.tags.join(' '),
      ].filter(Boolean).join('\n').toLocaleLowerCase()
      return haystack.includes(needle)
    })
  }, [deferredSearch, entries, filter, poolIds])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  useEffect(() => { setPage(0) }, [deferredSearch, filter])

  const changed = async (message: string) => {
    await refresh()
    await onChanged()
    onNotice(message)
  }

  const removeCard = async (entry: ManagedCard) => {
    const action = entry.origin === 'manual' ? tr('Delete', 'Удалить') : tr('Hide', 'Скрыть')
    if (!window.confirm(tr(`${action} “${entry.card.kanji}” from “${deck.name}”?`, `${action} карточку «${entry.card.kanji}» из колоды «${deck.name}»?`))) return
    await deleteCardFromDeck(deck.id, entry.card.id, settings)
    if (editor !== 'new' && editor?.card.id === entry.card.id) setEditor(null)
    await changed(entry.origin === 'manual' ? tr('Card deleted', 'Карточка удалена') : tr('Card hidden — you can restore it later', 'Карточка скрыта — её можно восстановить'))
  }

  const restoreCard = async (entry: ManagedCard) => {
    await restoreOriginalCard(deck.id, entry.card.id, settings)
    await changed(tr('Original card restored and added to the pool', 'Оригинальная карточка восстановлена и добавлена в пул'))
  }

  return (
    <div className="card-manager-overlay" role="dialog" aria-modal="true" aria-label={tr(`Cards in ${deck.name}`, `Карточки колоды ${deck.name}`)}>
      <section className="card-manager-panel">
        <header className="card-manager-header">
          <button type="button" className="manager-icon-button" aria-label={editor ? tr('Back to the list', 'Назад к списку') : tr('Close card manager', 'Закрыть менеджер')} onClick={() => editor ? setEditor(null) : onClose()}>
            {editor ? <ChevronLeft size={20} /> : <X size={20} />}
          </button>
          <span className="deck-level deck-manager-level">{deck.level ?? 'A'}</span>
          <div><span className="eyebrow">{tr('DECK', 'КОЛОДА')}</span><strong>{deck.name}</strong><small>{tr(`${entries.filter((entry) => !entry.hidden).length.toLocaleString(locale)} cards`, `${entries.filter((entry) => !entry.hidden).length.toLocaleString(locale)} карточек`)}</small></div>
          {!editor && <button type="button" className="primary-button manager-add-button" onClick={() => setEditor('new')}><Plus size={16} />{tr('Add card', 'Добавить карточку')}</button>}
        </header>

        {editor ? (
          <CardEditor
            deck={deck}
            settings={settings}
            entry={editor === 'new' ? undefined : editor}
            onCancel={() => setEditor(null)}
            onSaved={async (message) => { setEditor(null); await changed(message) }}
            onDelete={removeCard}
            onRestore={restoreCard}
          />
        ) : (
          <>
            <div className="card-manager-toolbar">
              <label className="card-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr('Kanji, reading, meaning or example…', 'Кандзи, чтение, значение или пример…')} autoFocus /></label>
              <div className="card-filter-tabs" aria-label={tr('Card filter', 'Фильтр карточек')}>
                {([
                  ['all', tr('All', 'Все')], ['pool', tr(`In pool · ${poolIds.size}`, `В пуле · ${poolIds.size}`)], ['modified', tr('My edits', 'Мои правки')], ['hidden', tr('Hidden', 'Скрытые')],
                ] as Array<[CardFilter, string]>).map(([value, label]) => (
                  <button key={value} type="button" className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>
                ))}
              </div>
            </div>

            <div className="card-manager-list" aria-busy={loading}>
              {loading ? <div className="manager-loading"><LoaderCircle className="spin" size={24} />{tr('Loading cards…', 'Загрузка карточек…')}</div> : visible.length ? visible.map((entry) => (
                <article key={entry.card.id} className={`managed-card-row ${entry.hidden ? 'is-hidden' : ''}`}>
                  <button type="button" className="managed-card-main" onClick={() => !entry.hidden && setEditor(entry)} disabled={entry.hidden}>
                    <span className="managed-headword">{entry.card.kanji}</span>
                    <span className="managed-card-copy"><strong>{entry.card.furigana || tr('No reading', 'Без чтения')}</strong><small>{(language === 'ru' ? entry.card.meaning_ru : entry.card.meaning_en) || entry.card.meaning_ru || entry.card.meaning_en || tr('No meaning', 'Без значения')}</small></span>
                    <span className="managed-card-badges">
                      {poolIds.has(entry.card.id) && !entry.hidden && <i className="pool-badge">{tr('In pool', 'В пуле')}</i>}
                      <i>{entry.hidden ? tr('Hidden', 'Скрыта') : originLabel(entry, language)}</i>
                    </span>
                  </button>
                  <div className="managed-card-actions">
                    {entry.hidden ? (
                      <button type="button" aria-label={tr(`Restore ${entry.card.kanji}`, `Восстановить ${entry.card.kanji}`)} title={tr('Restore original', 'Восстановить оригинал')} onClick={() => { void restoreCard(entry) }}><RotateCcw size={16} /></button>
                    ) : (
                      <>
                        <button type="button" aria-label={tr(`Edit ${entry.card.kanji}`, `Редактировать ${entry.card.kanji}`)} title={tr('Edit', 'Редактировать')} onClick={() => setEditor(entry)}><Pencil size={16} /></button>
                        <button type="button" className="danger-icon" aria-label={tr(`Remove ${entry.card.kanji}`, `Удалить ${entry.card.kanji}`)} title={entry.origin === 'manual' ? tr('Delete', 'Удалить') : tr('Hide', 'Скрыть')} onClick={() => { void removeCard(entry) }}><Trash2 size={16} /></button>
                      </>
                    )}
                  </div>
                </article>
              )) : (
                <div className="manager-empty"><Layers3 size={28} /><strong>{tr('Nothing found', 'Ничего не найдено')}</strong><span>{tr('Change the search or choose another filter.', 'Измените запрос или выберите другой фильтр.')}</span></div>
              )}
            </div>

            <footer className="card-manager-pagination">
              <span>{filtered.length ? tr(`${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length.toLocaleString(locale)}`, `${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} из ${filtered.length.toLocaleString(locale)}`) : tr('0 cards', '0 карточек')}</span>
              <div>
                <button type="button" aria-label={tr('Previous page', 'Предыдущая страница')} disabled={safePage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft size={17} /></button>
                <span>{safePage + 1} / {pageCount}</span>
                <button type="button" aria-label={tr('Next page', 'Следующая страница')} disabled={safePage + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}><ChevronRight size={17} /></button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  )
}

function CardEditor({ deck, settings, entry, onCancel, onSaved, onDelete, onRestore }: {
  deck: Deck
  settings: AppSettings
  entry?: ManagedCard
  onCancel: () => void
  onSaved: (message: string) => void | Promise<void>
  onDelete: (entry: ManagedCard) => void | Promise<void>
  onRestore: (entry: ManagedCard) => void | Promise<void>
}) {
  const language = settings.language
  const tr = (english: string, russian: string) => tx(language, english, russian)
  const [draft, setDraft] = useState<CardDraft>(() => entry ? draftFromCard(entry.card, language) : emptyDraft)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const update = <K extends keyof CardDraft>(key: K, value: CardDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const preview = cardFromDraft(draft, entry?.card, language)

  const save = async () => {
    const primaryMeaning = language === 'ru' ? draft.meaningRu : draft.meaningEn
    if (!draft.headword.trim() || !draft.reading.trim() || !primaryMeaning.trim()) {
      setError(tr('Fill in the word or kanji, its reading, and the English meaning', 'Заполните слово или кандзи, чтение и значение на русском'))
      return
    }
    setSaving(true)
    setError('')
    try {
      if (entry) {
        await updateCardInDeck(deck.id, cardFromDraft(draft, entry.card, language))
        await onSaved(tr('Card saved', 'Карточка сохранена'))
      } else {
        const { id: previewId, ...card } = cardFromDraft(draft, undefined, language)
        void previewId
        await addCardToDeck(deck.id, card, settings)
        await onSaved(tr('Card added to the current pool', 'Карточка добавлена и помещена в текущий пул'))
      }
    } catch (reason) {
      setError(localizedError(language, reason))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card-editor-layout">
      <form className="card-editor-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
        <div className="card-editor-title"><div><span className="eyebrow">{entry ? tr('EDIT CARD', 'РЕДАКТИРОВАНИЕ') : tr('NEW CARD', 'НОВАЯ КАРТОЧКА')}</span><h2>{entry ? entry.card.kanji : tr('Add to deck', 'Добавить в колоду')}</h2><p>{tr('Required fields are marked with a dot. You can fill in the rest later.', 'Обязательные поля отмечены точкой. Остальное можно заполнить позже.')}</p></div>{entry?.hidden && <EyeOff size={22} />}</div>
        <div className="card-editor-grid">
          <label><span>{tr('Word or kanji', 'Слово или кандзи')} <b>•</b></span><input value={draft.headword} onChange={(event) => update('headword', event.target.value)} placeholder="日本" autoFocus /></label>
          <label><span>{tr('Reading', 'Чтение')} <b>•</b></span><input value={draft.reading} onChange={(event) => update('reading', event.target.value)} placeholder="にほん" /></label>
          {language === 'en' ? <><label className="span-two"><span>Meaning in English <b>•</b></span><input value={draft.meaningEn} onChange={(event) => update('meaningEn', event.target.value)} placeholder="Japan" /></label><label className="span-two"><span>Meaning in Russian</span><input value={draft.meaningRu} onChange={(event) => update('meaningRu', event.target.value)} placeholder="Япония" /></label></> : <><label className="span-two"><span>Значение на русском <b>•</b></span><input value={draft.meaningRu} onChange={(event) => update('meaningRu', event.target.value)} placeholder="Япония" /></label><label className="span-two"><span>Значение на английском</span><input value={draft.meaningEn} onChange={(event) => update('meaningEn', event.target.value)} placeholder="Japan" /></label></>}
          <label><span>{tr('Onyomi', 'Онъёми')}</span><input value={draft.onyomi} onChange={(event) => update('onyomi', event.target.value)} placeholder="ニチ、ジツ" /></label>
          <label><span>{tr('Kunyomi', 'Кунъёми')}</span><input value={draft.kunyomi} onChange={(event) => update('kunyomi', event.target.value)} placeholder="ひ、-び" /></label>
          <label className="span-two"><span>{tr('Example with furigana', 'Пример с фуриганой')}</span><textarea value={draft.example} onChange={(event) => update('example', event.target.value)} placeholder="日本[にほん]へ行[い]きます。" /><small>{tr('Format: 漢字[かんじ]. This places furigana above each kanji.', 'Формат: 漢字[かんじ]. Так фуригана будет показана над каждым кандзи.')}</small></label>
          <label className="span-two"><span>{tr('Full example reading', 'Полное чтение примера')}</span><input value={draft.exampleReading} onChange={(event) => update('exampleReading', event.target.value)} placeholder={tr('Optional when readings are provided in brackets', 'Необязательно, если чтения указаны в квадратных скобках')} /></label>
          <label className="span-two"><span>{tr('Example translation', 'Перевод примера')}</span><input value={draft.exampleTranslation} onChange={(event) => update('exampleTranslation', event.target.value)} placeholder={tr('I am going to Japan.', 'Я еду в Японию.')} /></label>
          <label className="span-two"><span>{tr('Tags', 'Теги')}</span><input value={draft.tags} onChange={(event) => update('tags', event.target.value)} placeholder={tr('vocabulary, lesson 3', 'лексика, урок 3')} /></label>
        </div>
        {error && <div className="card-editor-error">{error}</div>}
        <footer className="card-editor-actions">
          <div>
            {entry && <button type="button" className="text-danger editor-delete" onClick={() => { void onDelete(entry) }}><Trash2 size={15} />{entry.origin === 'manual' ? tr('Delete card', 'Удалить карточку') : tr('Hide card', 'Скрыть карточку')}</button>}
            {entry && entry.origin !== 'manual' && entry.modified && <button type="button" className="editor-restore" onClick={() => { void onRestore(entry) }}><RotateCcw size={15} />{tr('Restore original', 'Восстановить оригинал')}</button>}
          </div>
          <div><button type="button" className="secondary-button" onClick={onCancel}>{tr('Cancel', 'Отмена')}</button><button type="submit" className="primary-button" disabled={saving}>{saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}{entry ? tr('Save', 'Сохранить') : tr('Add to pool', 'Добавить в пул')}</button></div>
        </footer>
      </form>

      <aside className="card-editor-preview">
        <span className="eyebrow">{tr('PREVIEW', 'ПРЕДПРОСМОТР')}</span>
        <div className="card-preview-shell"><KanjiCard card={preview} settings={{ ...settings, showFurigana: true, showOnyomi: true, showKunyomi: true }} compact /></div>
        <p>{tr('After saving, the content updates in every window. An active review keeps its original card list.', 'После сохранения содержимое обновится во всех окнах. Состав уже запущенного теста останется неизменным.')}</p>
      </aside>
    </div>
  )
}
