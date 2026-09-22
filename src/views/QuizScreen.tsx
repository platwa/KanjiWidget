import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, RefreshCcw, Trophy } from 'lucide-react'
import { EmptyState } from '../components/Controls'
import { RubyText } from '../components/RubyText'
import { FittedHeadword } from '../components/FittedHeadword'
import { WindowChrome } from '../components/WindowChrome'
import { DEFAULT_SETTINGS } from '../domain/defaults'
import type { AppSettings, Card, ReviewSummary } from '../domain/types'
import { applyDocumentLanguage, cardCountLabel, localizedError, ratingLabel, tx } from '../i18n'
import { formatDueInterval, previewIntervals } from '../services/scheduler'
import { closeCurrentWindow, emitAppEvent, listenAppEvent, openAppWindow } from '../services/platform'
import { buildQuizPool, finishQuizSession, getOrCreateState, loadSettings, reviewCard } from '../services/storage'
import { romanizeKana } from '../services/romanize'

function shuffled<T>(items: T[]) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

function withoutAnkiFurigana(value: string) {
  return value.replace(/([々〇〻㐀-鿿豈-﫿]+)\[[^\]]+]/g, '$1')
}

export function QuizScreen() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [cards, setCards] = useState<Card[]>([])
  const [total, setTotal] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [intervals, setIntervals] = useState<Record<number, string>>({})
  const [summary, setSummary] = useState<ReviewSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const ratingBusy = useRef(false)
  const pendingReview = useRef<Promise<Awaited<ReturnType<typeof reviewCard>>> | null>(null)
  const loadGeneration = useRef(0)
  const activeDeck = useRef(DEFAULT_SETTINGS.deckId)
  const sessionSettings = useRef(DEFAULT_SETTINGS)
  const reviewedCardIds = useRef<Set<string>>(new Set())
  const sessionActive = useRef(false)
  const endingSession = useRef<Promise<void> | null>(null)
  const windowClass = `app-window quiz-window theme-${settings.theme} font-${settings.fontSize}`
  const language = settings.language
  const tr = (english: string, russian: string) => tx(language, english, russian)

  useEffect(() => { applyDocumentLanguage(language) }, [language])

  const flushSession = useCallback(async () => {
    if (!reviewedCardIds.current.size) return
    const reviewed = [...reviewedCardIds.current]
    reviewedCardIds.current.clear()
    try {
      await finishQuizSession(sessionSettings.current, reviewed)
    } catch (error) {
      reviewed.forEach((id) => reviewedCardIds.current.add(id))
      throw error
    }
  }, [])

  const endSession = useCallback(async () => {
    if (endingSession.current) return endingSession.current
    const ending = (async () => {
      await pendingReview.current
      if (!sessionActive.current) return
      await flushSession()
      sessionActive.current = false
      await emitAppEvent('kanjiwidget:quiz-session-ended')
    })()
    endingSession.current = ending
    try { await ending } finally {
      if (endingSession.current === ending) endingSession.current = null
    }
  }, [flushSession])

  const startSession = useCallback(async (providedSettings?: AppSettings) => {
    const generation = ++loadGeneration.current
    setLoading(true)
    setError('')
    setRevealed(false)
    setIntervals({})
    setSummary([])
    try {
      await endSession()
      if (generation !== loadGeneration.current) return
      const nextSettings = providedSettings ?? await loadSettings()
      const pool = shuffled(await buildQuizPool(nextSettings))
      if (generation !== loadGeneration.current) return
      activeDeck.current = nextSettings.deckId
      sessionSettings.current = nextSettings
      sessionActive.current = true
      setSettings(nextSettings)
      setCards(pool)
      setTotal(pool.length)
      setLoading(false)
      await emitAppEvent('kanjiwidget:quiz-session-started')
    } catch (reason) {
      if (generation !== loadGeneration.current) return
      setError(localizedError(sessionSettings.current.language, reason))
      setLoading(false)
    }
  }, [endSession])

  const syncSettings = useCallback(async () => {
    try {
      const nextSettings = await loadSettings()
      if (nextSettings.deckId !== activeDeck.current) await startSession(nextSettings)
      else {
        sessionSettings.current = nextSettings
        setSettings(nextSettings)
      }
    } catch (reason) {
      setError(localizedError(sessionSettings.current.language, reason))
    }
  }, [startSession])

  const closeQuiz = useCallback(async () => {
    ++loadGeneration.current
    setLoading(true)
    try {
      await endSession()
      await closeCurrentWindow()
    } catch (reason) {
      setError(localizedError(sessionSettings.current.language, reason))
      setLoading(false)
    }
  }, [endSession])

  useEffect(() => {
    void startSession()
    const cleanups = [
      listenAppEvent('kanjiwidget:quiz-opened', () => { void startSession() }),
      listenAppEvent('kanjiwidget:settings-changed', () => { void syncSettings() }),
      listenAppEvent('kanjiwidget:quiz-close-requested', () => { void closeQuiz() }),
    ]
    return () => { void Promise.all(cleanups).then((items) => items.forEach((cleanup) => cleanup())) }
  }, [startSession, syncSettings, closeQuiz])

  const current = cards[0]
  const completed = summary.length
  const example = useMemo(() => current?.examples.find((item) => item.sentence) ?? current?.examples[0], [current])
  const sentence = example?.sentence ?? example?.word ?? ''
  const sentenceTranslation = example
    ? (settings.language === 'ru' ? example.sentence_ru || example.meaning_ru : example.sentence_en || example.meaning_en)
    : ''
  const meaning = current ? (settings.language === 'ru' ? current.meaning_ru : current.meaning_en) : ''

  useEffect(() => {
    let cancelled = false
    setRevealed(false)
    setIntervals({})
    if (current) {
      void getOrCreateState(current.id).then((state) => {
        if (!cancelled) setIntervals(previewIntervals(state, settings.requestRetention))
      }).catch((reason: unknown) => {
        if (!cancelled) setError(localizedError(settings.language, reason))
      })
    }
    return () => { cancelled = true }
  }, [current, settings.requestRetention, settings.language])

  const rate = useCallback(async (rating: 1 | 2 | 3 | 4) => {
    if (!current || !revealed || loading || ratingBusy.current) return
    const generation = loadGeneration.current
    ratingBusy.current = true
    setError('')
    const write = reviewCard(current.id, rating, settings).then((nextState) => {
      reviewedCardIds.current.add(current.id)
      return nextState
    })
    pendingReview.current = write
    try {
      const nextState = await write
      if (generation !== loadGeneration.current) return
      if (cards.length === 1) await endSession()
      if (generation !== loadGeneration.current) return
      setSummary((value) => [...value, { cardId: current.id, kanji: current.kanji, rating, due: nextState.due }])
      setCards((value) => value.slice(1))
    } catch (reason) {
      if (generation === loadGeneration.current) setError(localizedError(settings.language, reason))
    } finally {
      if (pendingReview.current === write) pendingReview.current = null
      ratingBusy.current = false
    }
  }, [cards.length, current, endSession, revealed, settings, loading])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return
      if (event.target instanceof HTMLButtonElement && (event.key === ' ' || event.key === 'Enter')) return
      if (!revealed && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault()
        setRevealed(true)
        return
      }
      const rating = Number(event.key)
      if (revealed && rating >= 1 && rating <= 4) void rate(rating as 1 | 2 | 3 | 4)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [rate, revealed])

  if (loading) {
    return <main className={windowClass}><WindowChrome language={language} eyebrow="KANJIWIDGET" title={tr('Review', 'Повторение')} onClose={() => { void closeQuiz() }} /><div className="screen-loading"><span /></div></main>
  }

  if (error) {
    return <main className={windowClass}><WindowChrome language={language} eyebrow="KANJIWIDGET" title={tr('Review', 'Повторение')} onClose={() => { void closeQuiz() }} /><EmptyState icon={<RefreshCcw size={30} />} title={tr('Could not complete the review action', 'Не удалось выполнить действие')} text={error} action={<button type="button" className="primary-button" onClick={() => { void startSession() }}>{tr('Try again', 'Попробовать снова')}</button>} /></main>
  }

  if (!total) {
    return (
      <main className={windowClass}>
        <WindowChrome language={language} eyebrow="KANJIWIDGET" title={tr('Review', 'Повторение')} onClose={() => { void closeQuiz() }} />
        <EmptyState icon={<Trophy size={30} />} title={tr('No cards due right now', 'Сейчас нет карточек для повторения')} text={tr('Come back later, or choose another deck in settings.', 'Вернитесь позже или выберите другую колоду в настройках.')} action={<button type="button" className="primary-button" onClick={() => openAppWindow('settings')}>{tr('Open settings', 'Открыть настройки')}</button>} />
      </main>
    )
  }

  if (!current) {
    const counts = ([1, 2, 3, 4] as const).map((rating) => ({ rating, count: summary.filter((item) => item.rating === rating).length }))
    return (
      <main className={windowClass}>
        <WindowChrome language={language} eyebrow="KANJIWIDGET" title={tr('Results', 'Результаты')} onClose={() => { void closeQuiz() }} />
        <section className="results-screen">
          <div className="trophy-mark"><Trophy size={34} /></div>
          <span className="eyebrow">{tr('REVIEW COMPLETE', 'ПОВТОРЕНИЕ ЗАВЕРШЕНО')}</span>
          <h1>{tr(`${cardCountLabel('en', total)} rated`, `${cardCountLabel('ru', total)} оценено`)}</h1>
          <p>{tr('Your ratings updated the widget schedule. You can review again at any time.', 'Оценки обновили расписание виджета. Тест можно пройти снова в любое время.')}</p>
          <div className="result-counts">
            {counts.map(({ rating, count }) => <div key={rating} className={`rating-${rating}`}><strong>{count}</strong><span>{ratingLabel(language, rating)}</span></div>)}
          </div>
          <div className="review-timeline">
            {summary.map((item) => (
              <div key={item.cardId}><span className="summary-kanji">{item.kanji}</span><span>{ratingLabel(language, item.rating)}</span><strong>{tr('in', 'через')} {formatDueInterval(item.due, new Date(), language)}</strong></div>
            ))}
          </div>
          <div className="result-actions">
            <button type="button" className="primary-button" onClick={() => { void startSession() }}>{tr('Review again', 'Пройти ещё раз')}<RefreshCcw size={16} /></button>
            <button type="button" className="secondary-button" onClick={() => { void closeQuiz() }}>{tr('Done', 'Готово')}<Check size={16} /></button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className={windowClass}>
      <WindowChrome language={language} eyebrow="KANJIWIDGET" title={tr('Review', 'Повторение')} trailing={<span className="quiz-counter">{completed + 1} / {total}</span>} onClose={() => { void closeQuiz() }} />
      <div className="quiz-progress"><span style={{ width: `${(completed / total) * 100}%` }} /></div>
      <section className="quiz-stage flashcard-stage">
        <div className="quiz-heading"><span className="eyebrow">{current.jlpt ?? 'ANKI'} · {tr('CARD', 'КАРТОЧКА')}</span><h1>{tr('Recall the reading and meaning', 'Вспомните чтение и значение')}</h1></div>
        <article className={`review-card ${revealed ? 'revealed' : ''}`}>
          <FittedHeadword className="review-kanji" text={current.kanji} sizeKey={`${settings.fontSize}:${revealed}`} />
          {!revealed && (
            <div className="review-example review-example-front" lang="ja">
              {sentence ? withoutAnkiFurigana(sentence) : <span>{tr('No example in this deck', 'Пример в колоде не указан')}</span>}
            </div>
          )}

          {!revealed ? (
            <button type="button" className="primary-button show-answer-button" onClick={() => setRevealed(true)}>{tr('Show answer', 'Показать ответ')}</button>
          ) : (
            <div className="review-answer">
              <div className="review-core-answer">
                <span className="review-main-reading">{current.furigana}</span>
                {settings.showRomaji && <span className="review-romaji" lang="en">{romanizeKana(current.furigana)}</span>}
                <strong>{meaning}</strong>
                {(current.onyomi.length > 0 || current.kunyomi.length > 0) && (
                  <div className="review-readings">
                    {current.onyomi.length > 0 && <span><b>音</b>{current.onyomi.join('、')}</span>}
                    {current.kunyomi.length > 0 && <span><b>訓</b>{current.kunyomi.join('、')}</span>}
                  </div>
                )}
              </div>
              {sentence && (
                <div className="review-example-answer">
                  <div lang="ja"><RubyText text={sentence} segments={example?.ruby} fallbackReading={example?.sentence_reading} target={current.kanji} /></div>
                  {sentenceTranslation && <small>{sentenceTranslation}</small>}
                </div>
              )}
            </div>
          )}
        </article>

        {revealed && (
          <div className="rating-area flashcard-rating">
            <span>{tr('When should this card appear again?', 'Когда показать карточку снова?')}</span>
            <div className="rating-buttons">
              {([1, 2, 3, 4] as const).map((rating) => (
                <button key={rating} type="button" className={`rating-${rating}`} onClick={() => rate(rating)}>
                  <strong>{ratingLabel(language, rating)}</strong>
                  <small>{intervals[rating] ? `${tr('in', 'через')} ${formatDueInterval(intervals[rating], new Date(), language)}` : tr('calculating…', 'расчёт…')}</small>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
      <footer className="quiz-footer"><span>{revealed ? <><kbd>1</kbd>–<kbd>4</kbd> {tr('rate', 'оценить')}</> : <><kbd>Space</kbd> {tr('show answer', 'показать ответ')}</>}</span><span>{tr('FSRS schedules the next review', 'FSRS рассчитывает следующий показ')}</span></footer>
    </main>
  )
}
