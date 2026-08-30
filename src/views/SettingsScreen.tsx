import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  Check, ChevronRight, Clock3, FolderOpen, Info, Layers3, MonitorCog,
  LibraryBig, Palette, Plus, RefreshCcw, RotateCcw, Save, ShieldCheck, Trash2,
} from 'lucide-react'
import { AnkiImportPanel } from '../components/AnkiImportPanel'
import { Field, Segmented, Switch } from '../components/Controls'
import { WindowChrome } from '../components/WindowChrome'
import { DEFAULT_SETTINGS, DECKS } from '../domain/defaults'
import type { AppSettings, Deck, DisplayMode, FontSize, ThemeMode } from '../domain/types'
import { listenAppEvent, openExternal, pickLockscreenFolder, setAutostart } from '../services/platform'
import {
  deleteCustomDeck, getDeckProgress, getDecks, loadSettings, resetDeckProgress, saveSettings,
} from '../services/storage'

type SectionId = 'appearance' | 'widget' | 'learning' | 'decks' | 'lockscreen' | 'about'
type Progress = Awaited<ReturnType<typeof getDeckProgress>>
type ManagerRequest = { deckId: string; cardId?: string; startWithNew?: boolean; key: number }

const CardManager = lazy(() => import('../components/CardManager').then((module) => ({ default: module.CardManager })))

const sections: Array<{ id: SectionId; label: string; icon: typeof Palette }> = [
  { id: 'appearance', label: 'Интерфейс', icon: Palette },
  { id: 'widget', label: 'Виджет', icon: MonitorCog },
  { id: 'learning', label: 'Обучение', icon: Clock3 },
  { id: 'decks', label: 'Колоды', icon: Layers3 },
  { id: 'lockscreen', label: 'Экран блокировки', icon: FolderOpen },
  { id: 'about', label: 'О программе', icon: Info },
]

export function SettingsScreen() {
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const [section, setSection] = useState<SectionId>(initialParams.get('section') === 'decks' ? 'decks' : 'appearance')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [decks, setDecks] = useState<Deck[]>(DECKS)
  const [progress, setProgress] = useState<Record<string, Progress>>({})
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [managerRequest, setManagerRequest] = useState<ManagerRequest | null>(() => {
    const deckId = initialParams.get('deckId')
    const cardId = initialParams.get('cardId')
    return deckId ? { deckId, cardId: cardId ?? undefined, key: Date.now() } : null
  })

  const dirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(saved), [saved, settings])
  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  const refreshProgress = async () => {
    const availableDecks = await getDecks()
    setDecks(availableDecks)
    const values = await Promise.all(availableDecks.map(async (deck) => [deck.id, await getDeckProgress(deck.id)] as const))
    setProgress(Object.fromEntries(values))
  }

  useEffect(() => {
    void loadSettings().then((value) => { setSettings(value); setSaved(value) })
    void refreshProgress()
  }, [])

  useEffect(() => {
    const cleanup = listenAppEvent<{ deckId: string; cardId: string }>('kanjiwidget:edit-card', (request) => {
      setSection('decks')
      setManagerRequest({ ...request, key: Date.now() })
    })
    return () => { void cleanup.then((dispose) => dispose()) }
  }, [])

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3500)
  }

  const openManager = (deckId: string, options: { cardId?: string; startWithNew?: boolean } = {}) => {
    setSection('decks')
    setManagerRequest({ deckId, ...options, key: Date.now() })
  }

  const managerDeck = managerRequest ? decks.find((deck) => deck.id === managerRequest.deckId) : undefined

  const handleSave = async () => {
    setBusy(true)
    try {
      await saveSettings(settings)
      await setAutostart(settings.autostart)
      setSaved(settings)
      setNotice('Настройки сохранены')
      window.setTimeout(() => setNotice(''), 2500)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={`app-window theme-${settings.theme}`}>
      <WindowChrome eyebrow="KANJIWIDGET" title="Настройки" trailing={notice && <span className="save-notice"><Check size={14} />{notice}</span>} />
      <div className="settings-layout">
        <aside className="settings-sidebar">
          <div className="sidebar-intro">
            <span>Настройте обучение под свой ритм</span>
          </div>
          <nav aria-label="Разделы настроек">
            {sections.map((item) => {
              const Icon = item.icon
              return (
                <button key={item.id} type="button" className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}>
                  <Icon size={18} /><span>{item.label}</span><ChevronRight size={15} className="nav-chevron" />
                </button>
              )
            })}
          </nav>
          <div className="privacy-note"><ShieldCheck size={16} /><span>Полностью офлайн<br /><small>Без аккаунта и телеметрии</small></span></div>
        </aside>

        <section className="settings-content">
          {section === 'appearance' && (
            <SettingsSection eyebrow="Внешний вид" title="Спокойный интерфейс" description="Выберите оформление, которое не отвлекает от материала.">
              <div className="theme-cards">
                {([
                  ['dark', 'Ночная', '#101218'],
                  ['light', 'Светлая', '#ece8df'],
                  ['auto', 'Системная', 'linear-gradient(135deg,#101218 50%,#ece8df 50%)'],
                ] as Array<[ThemeMode, string, string]>).map(([value, label, background]) => (
                  <button key={value} type="button" className={settings.theme === value ? 'active' : ''} onClick={() => update('theme', value)}>
                    <span className="theme-preview" style={{ background }}><i>水</i><b /></span>
                    <span>{label}</span>{settings.theme === value && <Check size={15} />}
                  </button>
                ))}
              </div>
              <div className="settings-card two-column">
                <Segmented value={settings.language} label="Язык значений" onChange={(value) => update('language', value)} options={[{ value: 'ru', label: 'Русский' }, { value: 'en', label: 'English' }]} />
                <Segmented<FontSize> value={settings.fontSize} label="Размер кандзи" onChange={(value) => update('fontSize', value)} options={[{ value: 'sm', label: 'Меньше' }, { value: 'md', label: 'Обычно' }, { value: 'lg', label: 'Больше' }]} />
              </div>
            </SettingsSection>
          )}

          {section === 'widget' && (
            <SettingsSection eyebrow="Виджет" title="Карточка на рабочем столе" description="Определите, что показывать и как виджет ведёт себя поверх окон.">
              <div className="settings-card">
                <Segmented<DisplayMode> value={settings.displayMode} label="Режим показа" onChange={(value) => update('displayMode', value)} options={[{ value: 'full', label: 'Вся карточка' }, { value: 'quiz', label: 'Загадка' }]} />
                <div className="settings-divider" />
                <Switch checked={settings.showFurigana} onChange={(value) => update('showFurigana', value)} label="Фуригана" description="Чтение над иероглифом" />
                <Switch checked={settings.showOnyomi} onChange={(value) => update('showOnyomi', value)} label="Онъёми" description="Китайские чтения" />
                <Switch checked={settings.showKunyomi} onChange={(value) => update('showKunyomi', value)} label="Кунъёми" description="Японские чтения" />
                <Switch checked={settings.alwaysOnTop} onChange={(value) => update('alwaysOnTop', value)} label="Поверх других окон" description="Виджет остаётся видимым во время работы" />
                <Switch checked={settings.autostart} onChange={(value) => update('autostart', value)} label="Запускать вместе с Windows" />
              </div>
              <div className="settings-card range-card">
                <div><strong>Прозрачность</strong><span>{Math.round(settings.opacity * 100)}%</span></div>
                <input type="range" min="50" max="100" value={settings.opacity * 100} onChange={(event) => update('opacity', Number(event.target.value) / 100)} />
              </div>
            </SettingsSection>
          )}

          {section === 'learning' && (
            <SettingsSection eyebrow="Обучение" title="Ваш ежедневный ритм" description="FSRS подбирает интервалы так, чтобы повторения приходились к моменту забывания.">
              <div className="settings-grid">
                <Field label="Карточек в пуле" hint="От 1 до 20 карточек">
                  <input type="number" min="1" max="20" value={settings.poolSize} onChange={(event) => update('poolSize', Math.max(1, Math.min(20, Number(event.target.value))))} />
                </Field>
                <Field label="Смена карточки">
                  <select value={settings.rotateIntervalSec} onChange={(event) => update('rotateIntervalSec', Number(event.target.value))}>
                    <option value="30">30 секунд</option><option value="60">1 минута</option><option value="300">5 минут</option>
                    <option value="600">10 минут</option><option value="3600">1 час</option>
                  </select>
                </Field>
                <Field label="Обновление пула">
                  <input type="time" value={settings.poolRefreshTime} onChange={(event) => update('poolRefreshTime', event.target.value)} />
                </Field>
                <Field label="Желаемое запоминание" hint="Рекомендуется 90%">
                  <select value={settings.requestRetention} onChange={(event) => update('requestRetention', Number(event.target.value))}>
                    <option value="0.85">85% · меньше повторов</option><option value="0.9">90% · баланс</option><option value="0.95">95% · чаще</option>
                  </select>
                </Field>
              </div>
              <div className="settings-card learning-note">
                <div className="card-heading"><div><strong>Повторение как в Anki</strong><small>Сначала кандзи и пример, затем ответ и оценка сложности</small></div><ShieldCheck size={18} /></div>
              </div>
            </SettingsSection>
          )}

          {section === 'decks' && (
            <SettingsSection eyebrow="Колоды" title="Материал для изучения" description="Используйте встроенные уровни JLPT или импортируйте собственную колоду Anki.">
              <AnkiImportPanel onImported={(deckId, message) => {
                update('deckId', deckId)
                showNotice(message)
                void refreshProgress()
              }} />
              <div className="deck-list">
                {decks.map((deck) => {
                  const data = progress[deck.id] ?? { total: deck.cardCount, learned: 0, learning: 0, newCount: deck.cardCount }
                  const done = data.total ? Math.round((data.learned / data.total) * 100) : 0
                  return (
                    <article key={deck.id} className={`deck-card ${settings.deckId === deck.id ? 'active' : ''}`}>
                      <button type="button" className="deck-select" onClick={() => update('deckId', deck.id)}>
                        <span className={`deck-level ${deck.source === 'anki' ? 'deck-level-anki' : ''}`}>{deck.level ?? 'A'}</span>
                        <span className="deck-copy"><strong>{deck.name}</strong><small>{deck.description}</small></span>
                        <span className="radio-dot">{settings.deckId === deck.id && <i />}</span>
                      </button>
                      <div className="deck-progress"><span style={{ width: `${done}%` }} /></div>
                      <div className="deck-stats"><span><b>{data.newCount}</b> новых</span><span><b>{data.learning}</b> в изучении</span><span><b>{data.learned}</b> на повторении</span></div>
                      <div className="deck-actions">
                        <button type="button" className="deck-action-button" onClick={() => openManager(deck.id)}><LibraryBig size={14} />Карточки <b>{data.total.toLocaleString('ru-RU')}</b></button>
                        <button type="button" className="deck-action-button deck-add-card" onClick={() => openManager(deck.id, { startWithNew: true })}><Plus size={14} />Добавить</button>
                        {settings.deckId === deck.id && <button type="button" className="text-danger" onClick={async () => {
                          if (!window.confirm(`Сбросить прогресс колоды ${deck.name}?`)) return
                          await resetDeckProgress(deck.id); await refreshProgress()
                        }}><RotateCcw size={14} />Сбросить прогресс</button>}
                        {deck.source === 'anki' && <button type="button" className="text-danger" onClick={async () => {
                          if (!window.confirm(`Удалить импортированную колоду «${deck.name}»?`)) return
                          await deleteCustomDeck(deck.id)
                          if (settings.deckId === deck.id) {
                            const fallback = { ...settings, deckId: DEFAULT_SETTINGS.deckId }
                            setSettings(fallback)
                            setSaved(fallback)
                            await saveSettings(fallback)
                          }
                          if (managerRequest?.deckId === deck.id) setManagerRequest(null)
                          await refreshProgress()
                        }}><Trash2 size={14} />Удалить колоду</button>}
                      </div>
                    </article>
                  )
                })}
              </div>
            </SettingsSection>
          )}

          {section === 'lockscreen' && (
            <SettingsSection eyebrow="Экран блокировки" title="Карточки в слайдшоу Windows" description="KanjiWidget создаёт изображения, а Windows показывает их штатными средствами.">
              <div className="settings-card">
                <Switch checked={settings.lockscreenExport} onChange={(value) => update('lockscreenExport', value)} label="Создавать изображения карточек" description="PNG 1920 × 1080 при каждой смене кандзи" />
                <div className="folder-picker">
                  <div><span>Папка слайдшоу</span><strong>{settings.lockscreenFolder ?? 'Не выбрана'}</strong></div>
                  <button className="secondary-button" type="button" onClick={async () => {
                    const folder = await pickLockscreenFolder(); if (folder) update('lockscreenFolder', folder)
                  }}><FolderOpen size={16} />Выбрать</button>
                </div>
              </div>
              <div className="instruction-card">
                <span className="instruction-number">1</span><p>Откройте <b>Параметры Windows → Персонализация → Экран блокировки</b>.</p>
                <span className="instruction-number">2</span><p>Выберите фон <b>Слайд-шоу</b> и добавьте выбранную выше папку.</p>
                <span className="instruction-number">3</span><p>Windows самостоятельно меняет изображения по своему расписанию.</p>
              </div>
            </SettingsSection>
          )}

          {section === 'about' && (
            <SettingsSection eyebrow="О программе" title="KanjiWidget 1.2" description="Ненавязчивое интервальное обучение японскому прямо на рабочем столе.">
              <div className="about-hero"><span>字</span><div><strong>Учите понемногу.<br />Помните надолго.</strong><small>Локальное приложение для Windows 10 и 11</small></div></div>
              <div className="settings-card license-copy">
                <h3>Данные и лицензии</h3>
                <p>Словарные данные предоставлены JMdict/KANJIDIC2, © Electronic Dictionary Research and Development Group (EDRDG), лицензия CC BY-SA 4.0.</p>
                <button type="button" className="link-button" onClick={() => openExternal('https://www.edrdg.org/edrdg/licence.html')}>Лицензия EDRDG <ChevronRight size={14} /></button>
                <p>JLPT-разметка и русские значения подготовлены на основе jlpt-kanji-dictionary. Планирование повторений — ts-fsrs, MIT.</p>
                <button type="button" className="link-button" onClick={() => openExternal('https://github.com/open-spaced-repetition/ts-fsrs')}>Исходный код ts-fsrs <ChevronRight size={14} /></button>
              </div>
              <div className="version-line"><span>Версия 1.2.0</span><span>Сделано для спокойного обучения</span></div>
            </SettingsSection>
          )}
        </section>
      </div>
      <footer className="settings-footer">
        <span>{dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}</span>
        <div>
          {dirty && <button type="button" className="secondary-button" onClick={() => setSettings(saved)}>Отменить</button>}
          <button type="button" className="primary-button" disabled={!dirty || busy} onClick={handleSave}>{busy ? <RefreshCcw size={16} className="spin" /> : <Save size={16} />}Сохранить</button>
        </div>
      </footer>
      {managerDeck && managerRequest && (
        <Suspense fallback={<div className="card-manager-overlay"><div className="manager-loading"><RefreshCcw className="spin" size={24} />Загрузка менеджера…</div></div>}>
          <CardManager
            key={managerRequest.key}
            deck={managerDeck}
            settings={{ ...settings, deckId: managerDeck.id }}
            initialCardId={managerRequest.cardId}
            startWithNew={managerRequest.startWithNew}
            onClose={() => setManagerRequest(null)}
            onChanged={refreshProgress}
            onNotice={showNotice}
          />
        </Suspense>
      )}
    </main>
  )
}

function SettingsSection({ eyebrow, title, description, children }: {
  eyebrow: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="settings-section">
      <div className="section-header"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      {children}
    </div>
  )
}
