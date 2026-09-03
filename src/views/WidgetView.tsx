import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BookOpenCheck, ChevronLeft, ChevronRight, Grip, LogOut, Pause, Pencil, Play, Settings2 } from 'lucide-react'
import { KanjiCard } from '../components/KanjiCard'
import { UPDATE_CHECK_INTERVAL_MS, UPDATE_CHECK_KEY } from '../config'
import { DEFAULT_SETTINGS } from '../domain/defaults'
import type { AppSettings, Card } from '../domain/types'
import { applyDocumentLanguage, tx } from '../i18n'
import {
  applyWidgetWindowSettings,
  beginWidgetDrag,
  checkForAppUpdate,
  endWidgetDrag,
  exitApplication,
  exportLockscreenCard,
  listenAppEvent,
  moveWidgetDrag,
  openAppWindow,
  openCardEditor,
  setNativeLanguage,
  startWidgetResize,
} from '../services/platform'
import { buildDailyPool, buildQuizPool, loadSettings } from '../services/storage'

function shuffle<T>(items: T[]) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[target]] = [copy[target], copy[index]]
  }
  return copy
}

export function WidgetView() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [cards, setCards] = useState<Card[]>([])
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [paused, setPaused] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const wheelLocked = useRef(false)
  const quizActive = useRef(false)
  const revealTimer = useRef<number | null>(null)
  const concealTimer = useRef<number | null>(null)
  const language = settings.language
  const tr = (english: string, russian: string) => tx(language, english, russian)

  useEffect(() => { applyDocumentLanguage(language) }, [language])

  const refresh = useCallback(async () => {
    const nextSettings = await loadSettings()
    const pool = quizActive.current ? await buildQuizPool(nextSettings) : await buildDailyPool(nextSettings)
    setSettings(nextSettings)
    setCards((current) => {
      const nextCards = new Map(pool.map((card) => [card.id, card]))
      const sameMembership = current.length === pool.length && current.every((card) => nextCards.has(card.id))
      if (!sameMembership) return shuffle(pool)
      const ordered = current.map((card) => nextCards.get(card.id)!)
      const contentChanged = current.some((card, cardIndex) => JSON.stringify(card) !== JSON.stringify(ordered[cardIndex]))
      return contentChanged ? ordered : current
    })
    setIndex((current) => pool.length ? Math.min(current, pool.length - 1) : 0)
    setLoading(false)
    await Promise.all([
      applyWidgetWindowSettings(nextSettings),
      setNativeLanguage(nextSettings.language),
    ])
  }, [])

  useEffect(() => {
    void refresh()
    const cleanups = [
      listenAppEvent('kanjiwidget:settings-changed', refresh),
      listenAppEvent('kanjiwidget:pool-changed', refresh),
      listenAppEvent('kanjiwidget:quiz-session-started', () => {
        quizActive.current = true
        void refresh()
      }),
      listenAppEvent('kanjiwidget:quiz-session-ended', () => {
        quizActive.current = false
        void refresh()
      }),
    ]
    return () => { void Promise.all(cleanups).then((items) => items.forEach((cleanup) => cleanup())) }
  }, [refresh])

  useEffect(() => {
    if (loading) return
    const nextCheck = Number(localStorage.getItem(UPDATE_CHECK_KEY) ?? 0)
    if (Number.isFinite(nextCheck) && nextCheck > Date.now()) return
    localStorage.setItem(UPDATE_CHECK_KEY, String(Date.now() + UPDATE_CHECK_INTERVAL_MS))
    let cancelled = false
    void checkForAppUpdate().then(async (update) => {
      if (!update || cancelled) return
      const { ask } = await import('@tauri-apps/plugin-dialog')
      const install = await ask(
        tx(
          language,
          `KanjiWidget ${update.version} is available. Install it now? The app will close while the update is installed.`,
          `Доступна версия KanjiWidget ${update.version}. Установить её сейчас? Во время обновления приложение закроется.`,
        ),
        {
          title: tx(language, 'KanjiWidget update', 'Обновление KanjiWidget'),
          kind: 'info',
          okLabel: tx(language, 'Install', 'Установить'),
          cancelLabel: tx(language, 'Later', 'Позже'),
        },
      )
      if (install && !cancelled) await update.install()
    }).catch((error) => console.warn('KanjiWidget update check failed', error))
    return () => { cancelled = true }
  }, [language, loading])

  const currentCard = cards[index]
  const clearRecallTimers = useCallback(() => {
    if (revealTimer.current !== null) window.clearTimeout(revealTimer.current)
    if (concealTimer.current !== null) window.clearTimeout(concealTimer.current)
    revealTimer.current = null
    concealTimer.current = null
  }, [])
  const next = useCallback(() => {
    if (!cards.length) return
    setIndex((value) => {
      if (value + 1 >= cards.length) {
        setCards((current) => {
          const mixed = shuffle(current)
          if (mixed.length > 1 && mixed[0].id === current[current.length - 1].id) {
            ;[mixed[0], mixed[1]] = [mixed[1], mixed[0]]
          }
          return mixed
        })
        return 0
      }
      return value + 1
    })
    setRevealed(false)
    setContextOpen(false)
  }, [cards.length])
  const previous = useCallback(() => {
    if (!cards.length) return
    setIndex((value) => (value - 1 + cards.length) % cards.length)
    setRevealed(false)
    setContextOpen(false)
  }, [cards.length])

  useEffect(() => {
    const cleanup = listenAppEvent('kanjiwidget:next-card', next)
    return () => { void cleanup.then((dispose) => dispose()) }
  }, [next])

  useLayoutEffect(() => {
    clearRecallTimers()
    setRevealed(false)
  }, [clearRecallTimers, settings.displayMode])

  useEffect(() => clearRecallTimers, [clearRecallTimers])

  useEffect(() => {
    const [hours, minutes] = settings.poolRefreshTime.split(':').map(Number)
    const now = new Date()
    const nextRefresh = new Date(now)
    nextRefresh.setHours(hours, minutes, 0, 0)
    if (nextRefresh <= now) nextRefresh.setDate(nextRefresh.getDate() + 1)
    const timer = window.setTimeout(refresh, nextRefresh.getTime() - now.getTime() + 500)
    return () => window.clearTimeout(timer)
  }, [refresh, settings.poolRefreshTime])

  useEffect(() => {
    const timer = window.setInterval(() => { void refresh() }, 30_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    if (paused || contextOpen || !cards.length) return
    const timer = window.setInterval(next, settings.rotateIntervalSec * 1000)
    return () => window.clearInterval(timer)
  }, [cards.length, contextOpen, next, paused, settings.rotateIntervalSec])

  useEffect(() => {
    if (currentCard) void exportLockscreenCard(currentCard, settings).catch(console.error)
  }, [currentCard, settings])

  const concealment = !revealed
    ? settings.displayMode === 'quiz' ? 'all' : settings.displayMode === 'active-recall' ? 'answers' : 'none'
    : 'none'
  const rootStyle = useMemo(() => ({ '--widget-opacity': settings.opacity } as React.CSSProperties), [settings.opacity])

  const revealRecallAnswer = () => {
    if (settings.displayMode !== 'active-recall' || revealed) return
    if (concealTimer.current !== null) window.clearTimeout(concealTimer.current)
    concealTimer.current = null
    if (revealTimer.current !== null) return
    revealTimer.current = window.setTimeout(() => {
      revealTimer.current = null
      setRevealed(true)
    }, 300)
  }

  const concealRecallAnswer = () => {
    if (settings.displayMode !== 'active-recall') return
    if (revealTimer.current !== null) window.clearTimeout(revealTimer.current)
    revealTimer.current = null
    if (!revealed || concealTimer.current !== null) return
    concealTimer.current = window.setTimeout(() => {
      concealTimer.current = null
      setRevealed(false)
    }, 180)
  }

  const handleCardClick = (event: React.MouseEvent) => {
    if (contextOpen) return setContextOpen(false)
    if (event.ctrlKey) return previous()
    if (settings.displayMode !== 'full' && !revealed) return setRevealed(true)
    next()
  }

  const handleWheel = (event: React.WheelEvent) => {
    if (wheelLocked.current) return
    wheelLocked.current = true
    if (event.deltaY < 0) previous()
    else next()
    window.setTimeout(() => { wheelLocked.current = false }, 220)
  }

  return (
    <main
      className={`widget-shell theme-${settings.theme} font-${settings.fontSize}`}
      style={rootStyle}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => { setPaused(false); setContextOpen(false); concealRecallAnswer() }}
      onWheel={handleWheel}
      onContextMenu={(event) => { event.preventDefault(); setContextOpen(true) }}
    >
      <div
        className="widget-drag-region"
        aria-label={tr('Move widget', 'Переместить виджет')}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          void beginWidgetDrag(event.screenX, event.screenY)
        }}
        onPointerMove={(event) => {
          if ((event.buttons & 1) !== 0) moveWidgetDrag(event.screenX, event.screenY)
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId)
          endWidgetDrag()
        }}
        onPointerCancel={endWidgetDrag}
      >
        <Grip size={14} aria-hidden="true" />
      </div>
      <button
        className="widget-main"
        type="button"
        onClick={handleCardClick}
        onMouseEnter={revealRecallAnswer}
        onMouseLeave={concealRecallAnswer}
        onBlur={concealRecallAnswer}
        aria-label={settings.displayMode !== 'full' && !revealed ? tr('Reveal answer', 'Показать ответ') : tr('Next card', 'Следующая карточка')}
      >
        {loading ? (
          <div className="widget-loading"><span /><span /><span /></div>
        ) : currentCard ? (
          <div className="card-transition" key={currentCard.id}>
            <KanjiCard card={currentCard} settings={settings} concealment={concealment} />
          </div>
        ) : (
          <div className="widget-empty">{tr('The deck is empty', 'Колода пуста')}</div>
        )}
      </button>

      <div className="widget-hud">
        <button type="button" onClick={previous} aria-label={tr('Previous card', 'Предыдущая')}><ChevronLeft size={16} /></button>
        <span className="pool-position">{cards.length ? index + 1 : 0}<i>/</i>{cards.length}</span>
        <span className="pause-indicator">{paused ? <Pause size={11} /> : <Play size={11} />}</span>
        <button type="button" aria-label={tr('Edit current card', 'Редактировать текущую карточку')} title={tr('Edit card', 'Редактировать карточку')} disabled={!currentCard} onClick={() => { if (currentCard) void openCardEditor(settings.deckId, currentCard.id) }}><Pencil size={13} /></button>
        <button type="button" aria-label={tr('Open settings', 'Открыть настройки')} title={tr('Settings', 'Настройки')} onClick={() => openAppWindow('settings')}><Settings2 size={13} /></button>
        <button type="button" onClick={next} aria-label={tr('Next card', 'Следующая')}><ChevronRight size={16} /></button>
      </div>

      {contextOpen && (
        <div className="widget-context-menu" role="menu">
          <button type="button" onClick={next}><ChevronRight size={15} />{tr('Next card', 'Следующая')}</button>
          <button type="button" onClick={() => openAppWindow('quiz')}><BookOpenCheck size={15} />{tr('Start review', 'Открыть тест')}</button>
          <button type="button" disabled={!currentCard} onClick={() => { if (currentCard) void openCardEditor(settings.deckId, currentCard.id) }}><Pencil size={15} />{tr('Edit card', 'Редактировать карточку')}</button>
          <button type="button" onClick={() => openAppWindow('settings')}><Settings2 size={15} />{tr('Settings', 'Настройки')}</button>
          <button type="button" onClick={exitApplication}><LogOut size={15} />{tr('Exit', 'Выход')}</button>
        </div>
      )}
      <button className="resize-handle" type="button" aria-label={tr('Resize widget', 'Изменить размер')} onMouseDown={startWidgetResize} />
    </main>
  )
}
