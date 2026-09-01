import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  Bug, Check, ChevronRight, Clock3, FolderOpen, Github, Heart, Info, Layers3,
  LibraryBig, Mail, MonitorCog, Palette, Plus, RefreshCcw, RotateCcw, Save,
  ShieldCheck, Trash2, X,
} from 'lucide-react'
import { AnkiImportPanel } from '../components/AnkiImportPanel'
import { Field, Segmented, Switch } from '../components/Controls'
import { WindowChrome } from '../components/WindowChrome'
import {
  APP_NAME, APP_VERSION, bugReportUrl, contactEmailUrl, isSupportReminderDue,
  ISSUES_URL, nextSupportReminderDate, SOURCE_URL, SUPPORT_EMAIL, SUPPORT_REMINDER_KEY,
  SUPPORT_URL,
} from '../config'
import { DEFAULT_SETTINGS, DECKS } from '../domain/defaults'
import type { AppSettings, Deck, DisplayMode, FontSize, ThemeMode } from '../domain/types'
import { applyDocumentLanguage, cardCountLabel, numberLocale, tx } from '../i18n'
import { listenAppEvent, openExternal, pickLockscreenFolder, setAutostart } from '../services/platform'
import { deleteCustomDeck, getDeckProgress, getDecks, loadSettings, resetDeckProgress, saveSettings } from '../services/storage'

type SectionId = 'appearance' | 'widget' | 'learning' | 'decks' | 'lockscreen' | 'about'
type Progress = Awaited<ReturnType<typeof getDeckProgress>>
type ManagerRequest = { deckId: string; cardId?: string; startWithNew?: boolean; key: number }

const CardManager = lazy(() => import('../components/CardManager').then((module) => ({ default: module.CardManager })))
export function SettingsScreen() {
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const [section, setSection] = useState<SectionId>(initialParams.get('section') === 'decks' ? 'decks' : 'appearance')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [decks, setDecks] = useState<Deck[]>(DECKS)
  const [progress, setProgress] = useState<Record<string, Progress>>({})
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [managerRequest, setManagerRequest] = useState<ManagerRequest | null>(() => {
    const deckId = initialParams.get('deckId')
    const cardId = initialParams.get('cardId')
    return deckId ? { deckId, cardId: cardId ?? undefined, key: Date.now() } : null
  })

  const language = settings.language
  const tr = (english: string, russian: string) => tx(language, english, russian)
  const locale = numberLocale(language)
  const dirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(saved), [saved, settings])
  const sections: Array<{ id: SectionId; label: string; icon: typeof Palette }> = [
    { id: 'appearance', label: tr('Interface', 'Интерфейс'), icon: Palette },
    { id: 'widget', label: tr('Widget', 'Виджет'), icon: MonitorCog },
    { id: 'learning', label: tr('Learning', 'Обучение'), icon: Clock3 },
    { id: 'decks', label: tr('Decks', 'Колоды'), icon: Layers3 },
    { id: 'lockscreen', label: tr('Lock screen', 'Экран блокировки'), icon: FolderOpen },
    { id: 'about', label: tr('About', 'О программе'), icon: Info },
  ]

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setSettings((current) => ({ ...current, [key]: value }))
  const refreshProgress = async () => {
    const availableDecks = await getDecks()
    setDecks(availableDecks)
    const values = await Promise.all(availableDecks.map(async (deck) => [deck.id, await getDeckProgress(deck.id)] as const))
    setProgress(Object.fromEntries(values))
  }

  useEffect(() => {
    void loadSettings().then((value) => {
      setSettings(value)
      setSaved(value)
      const reminder = localStorage.getItem(SUPPORT_REMINDER_KEY)
      if (isSupportReminderDue(reminder)) setSupportOpen(true)
    })
    void refreshProgress()
  }, [])
  useEffect(() => { applyDocumentLanguage(language) }, [language])
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
  const dismissSupport = () => {
    localStorage.setItem(SUPPORT_REMINDER_KEY, nextSupportReminderDate())
    setSupportOpen(false)
  }
  const openLink = (url: string, afterOpen?: () => void) => {
    void openExternal(url)
      .then(() => afterOpen?.())
      .catch(() => showNotice(tr('Could not open the link', 'Не удалось открыть ссылку')))
  }
  const handleSave = async () => {
    setBusy(true)
    try {
      await saveSettings(settings)
      await setAutostart(settings.autostart)
      setSaved(settings)
      setNotice(tr('Settings saved', 'Настройки сохранены'))
      window.setTimeout(() => setNotice(''), 2500)
    } finally {
      setBusy(false)
    }
  }
  const deckDescription = (deck: Deck, count: number) => {
    if (deck.source === 'anki') return tr(`${cardCountLabel('en', count)} · imported from .apkg`, `${cardCountLabel('ru', count)} · импортировано из .apkg`)
    if (deck.id === 'jlpt-n5') return tr('80 essential kanji for beginners', '80 базовых кандзи для начала обучения')
    if (deck.id === 'jlpt-n4') return tr('170 kanji for the next level', '170 кандзи следующего уровня')
    return deck.description
  }
  const managerDeck = managerRequest ? decks.find((deck) => deck.id === managerRequest.deckId) : undefined

  return (
    <main className={`app-window theme-${settings.theme}`}>
      <WindowChrome language={language} eyebrow="KANJIWIDGET" title={tr('Settings', 'Настройки')} trailing={notice && <span className="save-notice"><Check size={14} />{notice}</span>} />
      <div className="settings-layout">
        <aside className="settings-sidebar">
          <div className="sidebar-intro"><span>{tr('Shape learning around your rhythm', 'Настройте обучение под свой ритм')}</span></div>
          <nav aria-label={tr('Settings sections', 'Разделы настроек')}>
            {sections.map((item) => {
              const Icon = item.icon
              return <button key={item.id} type="button" className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}><Icon size={18} /><span>{item.label}</span><ChevronRight size={15} className="nav-chevron" /></button>
            })}
          </nav>
          <div className="sidebar-bottom">
            <button className="support-sidebar-button" type="button" onClick={() => setSupportOpen(true)}><Heart size={16} />{tr('Support the author', 'Поддержать автора')}</button>
            <div className="privacy-note"><ShieldCheck size={16} /><span>{tr('Fully offline', 'Полностью офлайн')}<br /><small>{tr('No account or telemetry', 'Без аккаунта и телеметрии')}</small></span></div>
          </div>
        </aside>

        <section className="settings-content">
          {section === 'appearance' && <SettingsSection eyebrow={tr('Appearance', 'Внешний вид')} title={tr('A calm interface', 'Спокойный интерфейс')} description={tr('Choose a look that keeps your focus on the material.', 'Выберите оформление, которое не отвлекает от материала.')}>
            <div className="theme-cards">
              {([
                ['dark', tr('Dark', 'Ночная'), '#101218'],
                ['light', tr('Light', 'Светлая'), '#ece8df'],
                ['auto', tr('System', 'Системная'), 'linear-gradient(135deg,#101218 50%,#ece8df 50%)'],
              ] as Array<[ThemeMode, string, string]>).map(([value, label, background]) => <button key={value} type="button" className={settings.theme === value ? 'active' : ''} onClick={() => update('theme', value)}><span className="theme-preview" style={{ background }}><i>水</i><b /></span><span>{label}</span>{settings.theme === value && <Check size={15} />}</button>)}
            </div>
            <div className="settings-card two-column">
              <Segmented value={settings.language} label={tr('Interface language', 'Язык интерфейса')} onChange={(value) => update('language', value)} options={[{ value: 'en', label: 'English' }, { value: 'ru', label: 'Русский' }]} />
              <Segmented<FontSize> value={settings.fontSize} label={tr('Kanji size', 'Размер кандзи')} onChange={(value) => update('fontSize', value)} options={[{ value: 'sm', label: tr('Smaller', 'Меньше') }, { value: 'md', label: tr('Regular', 'Обычно') }, { value: 'lg', label: tr('Larger', 'Больше') }]} />
            </div>
          </SettingsSection>}

          {section === 'widget' && <SettingsSection eyebrow={tr('Widget', 'Виджет')} title={tr('A card on your desktop', 'Карточка на рабочем столе')} description={tr('Choose what the widget shows and how it behaves above other windows.', 'Определите, что показывать и как виджет ведёт себя поверх окон.')}>
            <div className="settings-card">
              <Segmented<DisplayMode> value={settings.displayMode} label={tr('Display mode', 'Режим показа')} onChange={(value) => update('displayMode', value)} options={[{ value: 'full', label: tr('Full card', 'Вся карточка') }, { value: 'quiz', label: tr('Prompt', 'Загадка') }]} />
              <div className="settings-divider" />
              <Switch checked={settings.showFurigana} onChange={(value) => update('showFurigana', value)} label={tr('Furigana', 'Фуригана')} description={tr('Readings above kanji', 'Чтения над кандзи')} />
              <Switch checked={settings.showOnyomi} onChange={(value) => update('showOnyomi', value)} label={tr('Onyomi', 'Онъёми')} description={tr('Sino-Japanese readings', 'Китайские чтения')} />
              <Switch checked={settings.showKunyomi} onChange={(value) => update('showKunyomi', value)} label={tr('Kunyomi', 'Кунъёми')} description={tr('Native Japanese readings', 'Японские чтения')} />
              <Switch checked={settings.alwaysOnTop} onChange={(value) => update('alwaysOnTop', value)} label={tr('Always on top', 'Поверх других окон')} description={tr('Keep the widget visible while you work', 'Виджет остаётся видимым во время работы')} />
              <Switch checked={settings.autostart} onChange={(value) => update('autostart', value)} label={tr('Start with Windows', 'Запускать вместе с Windows')} />
            </div>
            <div className="settings-card range-card"><div><strong>{tr('Opacity', 'Прозрачность')}</strong><span>{Math.round(settings.opacity * 100)}%</span></div><input aria-label={tr('Widget opacity', 'Прозрачность виджета')} type="range" min="50" max="100" value={settings.opacity * 100} onChange={(event) => update('opacity', Number(event.target.value) / 100)} /></div>
          </SettingsSection>}

          {section === 'learning' && <SettingsSection eyebrow={tr('Learning', 'Обучение')} title={tr('Your daily rhythm', 'Ваш ежедневный ритм')} description={tr('FSRS schedules reviews close to the moment you are likely to forget.', 'FSRS подбирает интервалы так, чтобы повторения приходились к моменту забывания.')}>
            <div className="settings-grid">
              <Field label={tr('Cards in the pool', 'Карточек в пуле')} hint={tr('From 1 to 20 cards', 'От 1 до 20 карточек')}><input type="number" min="1" max="20" value={settings.poolSize} onChange={(event) => update('poolSize', Math.max(1, Math.min(20, Number(event.target.value))))} /></Field>
              <Field label={tr('Card rotation', 'Смена карточки')}><select value={settings.rotateIntervalSec} onChange={(event) => update('rotateIntervalSec', Number(event.target.value))}><option value="30">{tr('30 seconds', '30 секунд')}</option><option value="60">{tr('1 minute', '1 минута')}</option><option value="300">{tr('5 minutes', '5 минут')}</option><option value="600">{tr('10 minutes', '10 минут')}</option><option value="3600">{tr('1 hour', '1 час')}</option></select></Field>
              <Field label={tr('Pool refresh time', 'Обновление пула')}><input type="time" value={settings.poolRefreshTime} onChange={(event) => update('poolRefreshTime', event.target.value)} /></Field>
              <Field label={tr('Desired retention', 'Желаемое запоминание')} hint={tr('90% is recommended', 'Рекомендуется 90%')}><select value={settings.requestRetention} onChange={(event) => update('requestRetention', Number(event.target.value))}><option value="0.85">{tr('85% · fewer reviews', '85% · меньше повторов')}</option><option value="0.9">{tr('90% · balanced', '90% · баланс')}</option><option value="0.95">{tr('95% · more often', '95% · чаще')}</option></select></Field>
            </div>
            <div className="settings-card learning-note"><div className="card-heading"><div><strong>{tr('Anki-style review', 'Повторение как в Anki')}</strong><small>{tr('See the kanji and example first, then reveal the answer and rate it', 'Сначала кандзи и пример, затем ответ и оценка сложности')}</small></div><ShieldCheck size={18} /></div></div>
          </SettingsSection>}

          {section === 'decks' && <SettingsSection eyebrow={tr('Decks', 'Колоды')} title={tr('Material to learn', 'Материал для изучения')} description={tr('Use the built-in JLPT levels or import your own Anki deck.', 'Используйте встроенные уровни JLPT или импортируйте собственную колоду Anki.')}>
            <AnkiImportPanel language={language} onImported={(deckId, message) => { update('deckId', deckId); showNotice(message); void refreshProgress() }} />
            <div className="deck-list">{decks.map((deck) => {
              const data = progress[deck.id] ?? { total: deck.cardCount, learned: 0, learning: 0, newCount: deck.cardCount }
              const done = data.total ? Math.round((data.learned / data.total) * 100) : 0
              return <article key={deck.id} className={`deck-card ${settings.deckId === deck.id ? 'active' : ''}`}>
                <button type="button" className="deck-select" onClick={() => update('deckId', deck.id)}><span className={`deck-level ${deck.source === 'anki' ? 'deck-level-anki' : ''}`}>{deck.level ?? 'A'}</span><span className="deck-copy"><strong>{deck.name}</strong><small>{deckDescription(deck, data.total)}</small></span><span className="radio-dot">{settings.deckId === deck.id && <i />}</span></button>
                <div className="deck-progress"><span style={{ width: `${done}%` }} /></div>
                <div className="deck-stats"><span><b>{data.newCount}</b> {tr('new', 'новых')}</span><span><b>{data.learning}</b> {tr('learning', 'в изучении')}</span><span><b>{data.learned}</b> {tr('reviewing', 'на повторении')}</span></div>
                <div className="deck-actions">
                  <button type="button" className="deck-action-button" onClick={() => openManager(deck.id)}><LibraryBig size={14} />{tr('Cards', 'Карточки')} <b>{data.total.toLocaleString(locale)}</b></button>
                  <button type="button" className="deck-action-button deck-add-card" onClick={() => openManager(deck.id, { startWithNew: true })}><Plus size={14} />{tr('Add', 'Добавить')}</button>
                  {settings.deckId === deck.id && <button type="button" className="text-danger" onClick={async () => { if (!window.confirm(tr(`Reset progress for ${deck.name}?`, `Сбросить прогресс колоды ${deck.name}?`))) return; await resetDeckProgress(deck.id); await refreshProgress() }}><RotateCcw size={14} />{tr('Reset progress', 'Сбросить прогресс')}</button>}
                  {deck.source === 'anki' && <button type="button" className="text-danger" onClick={async () => {
                    if (!window.confirm(tr(`Delete imported deck “${deck.name}”?`, `Удалить импортированную колоду «${deck.name}»?`))) return
                    await deleteCustomDeck(deck.id)
                    if (settings.deckId === deck.id) { const fallback = { ...settings, deckId: DEFAULT_SETTINGS.deckId }; setSettings(fallback); setSaved(fallback); await saveSettings(fallback) }
                    if (managerRequest?.deckId === deck.id) setManagerRequest(null)
                    await refreshProgress()
                  }}><Trash2 size={14} />{tr('Delete deck', 'Удалить колоду')}</button>}
                </div>
              </article>
            })}</div>
          </SettingsSection>}

          {section === 'lockscreen' && <SettingsSection eyebrow={tr('Lock screen', 'Экран блокировки')} title={tr('Cards in the Windows slideshow', 'Карточки в слайдшоу Windows')} description={tr('KanjiWidget creates the images and Windows displays them using its built-in slideshow.', 'KanjiWidget создаёт изображения, а Windows показывает их штатными средствами.')}>
            <div className="settings-card">
              <Switch checked={settings.lockscreenExport} onChange={(value) => update('lockscreenExport', value)} label={tr('Create card images', 'Создавать изображения карточек')} description={tr('1920 × 1080 PNG whenever the kanji changes', 'PNG 1920 × 1080 при каждой смене кандзи')} />
              <div className="folder-picker"><div><span>{tr('Slideshow folder', 'Папка слайдшоу')}</span><strong>{settings.lockscreenFolder ?? tr('Not selected', 'Не выбрана')}</strong></div><button className="secondary-button" type="button" onClick={async () => { const folder = await pickLockscreenFolder(language); if (folder) update('lockscreenFolder', folder) }}><FolderOpen size={16} />{tr('Choose', 'Выбрать')}</button></div>
            </div>
            <div className="instruction-card"><span className="instruction-number">1</span><p>{tr('Open ', 'Откройте ')}<b>{tr('Windows Settings → Personalization → Lock screen', 'Параметры Windows → Персонализация → Экран блокировки')}</b>.</p><span className="instruction-number">2</span><p>{tr('Choose ', 'Выберите фон ')}<b>{tr('Slideshow', 'Слайд-шоу')}</b>{tr(' and add the folder selected above.', ' и добавьте выбранную выше папку.')}</p><span className="instruction-number">3</span><p>{tr('Windows will rotate the images on its own schedule.', 'Windows самостоятельно меняет изображения по своему расписанию.')}</p></div>
          </SettingsSection>}

          {section === 'about' && <SettingsSection eyebrow={tr('About', 'О программе')} title={`${APP_NAME} ${APP_VERSION}`} description={tr('Calm, spaced Japanese learning right on your desktop.', 'Ненавязчивое интервальное обучение японскому прямо на рабочем столе.')}>
            <div className="about-hero"><span>字</span><div><strong>{tr('Learn a little. Remember for longer.', 'Учите понемногу. Помните надолго.')}</strong><small>{tr('A local app for Windows 10 and 11', 'Локальное приложение для Windows 10 и 11')}</small></div></div>
            <div className="settings-card contact-card"><div><h3>{tr('Feedback and support', 'Обратная связь и поддержка')}</h3><p>{tr('Found a problem or have an idea? Send a pre-filled report by email. Please do not attach private Anki data.', 'Нашли ошибку или есть идея? Отправьте подготовленное письмо. Не прикладывайте личные данные из Anki.')}</p></div><div className="contact-actions"><button type="button" className="secondary-button" onClick={() => openLink(bugReportUrl(language))}><Bug size={16} />{tr('Report a bug', 'Сообщить об ошибке')}</button><button type="button" className="secondary-button" onClick={() => openLink(ISSUES_URL)}><Github size={16} />GitHub Issues</button></div><a href={contactEmailUrl(language)} onClick={(event) => { event.preventDefault(); openLink(contactEmailUrl(language)) }}><Mail size={15} />{SUPPORT_EMAIL}</a></div>
            <div className="settings-card license-copy"><h3>{tr('Code, data and licenses', 'Код, данные и лицензии')}</h3><p>{tr('KanjiWidget source code is available under Apache License 2.0. Dictionary data derived from JMdict/KANJIDIC2 remains under CC BY-SA 4.0.', 'Исходный код KanjiWidget доступен по Apache License 2.0. Словарные данные на основе JMdict/KANJIDIC2 сохраняют лицензию CC BY-SA 4.0.')}</p><button type="button" className="link-button" onClick={() => openLink(SOURCE_URL)}>{tr('Source code', 'Исходный код')} <ChevronRight size={14} /></button><button type="button" className="link-button" onClick={() => openLink('https://www.edrdg.org/edrdg/licence.html')}>{tr('EDRDG license', 'Лицензия EDRDG')} <ChevronRight size={14} /></button></div>
            <div className="version-line"><span>{tr('Version', 'Версия')} {APP_VERSION}</span><span>{tr('Made for calm, focused learning', 'Сделано для спокойного обучения')}</span></div>
          </SettingsSection>}
        </section>
      </div>

      <footer className="settings-footer"><span>{dirty ? tr('You have unsaved changes', 'Есть несохранённые изменения') : tr('All changes are saved', 'Все изменения сохранены')}</span><div>{dirty && <button type="button" className="secondary-button" onClick={() => setSettings(saved)}>{tr('Cancel', 'Отменить')}</button>}<button type="button" className="primary-button" disabled={!dirty || busy} onClick={handleSave}>{busy ? <RefreshCcw size={16} className="spin" /> : <Save size={16} />}{tr('Save', 'Сохранить')}</button></div></footer>

      {managerDeck && managerRequest && <Suspense fallback={<div className="card-manager-overlay"><div className="manager-loading"><RefreshCcw className="spin" size={24} />{tr('Loading card manager…', 'Загрузка менеджера…')}</div></div>}><CardManager key={managerRequest.key} deck={managerDeck} settings={{ ...settings, deckId: managerDeck.id }} initialCardId={managerRequest.cardId} startWithNew={managerRequest.startWithNew} onClose={() => setManagerRequest(null)} onChanged={refreshProgress} onNotice={showNotice} /></Suspense>}

      {supportOpen && <div className="support-dialog-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) dismissSupport() }}><section className="support-dialog" role="dialog" aria-modal="true" aria-labelledby="support-title"><button type="button" className="support-dialog-close" aria-label={tr('Close', 'Закрыть')} onClick={dismissSupport}><X size={18} /></button><span className="support-heart"><Heart size={24} fill="currentColor" /></span><span className="eyebrow">{tr('FREE & OPEN SOURCE', 'БЕСПЛАТНО И ОТКРЫТО')}</span><h2 id="support-title">{tr('Enjoying KanjiWidget?', 'Нравится KanjiWidget?')}</h2><p>{tr('The app is completely free, has no ads or paid features, and sends no telemetry. If it helps you learn Japanese, you can support its continued development.', 'Приложение полностью бесплатное: без рекламы, платных функций и телеметрии. Если оно помогает вам учить японский, можно поддержать дальнейшую разработку.')}</p><button type="button" className="primary-button support-primary" onClick={() => openLink(SUPPORT_URL, dismissSupport)}><Heart size={16} />{tr('Support KanjiWidget', 'Поддержать KanjiWidget')}</button><small>{tr('The secure Tribute page will open in your browser.', 'В браузере откроется защищённая страница Tribute.')}</small><button type="button" className="support-later" onClick={dismissSupport}>{tr('Remind me next week', 'Напомнить через неделю')}</button></section></div>}
    </main>
  )
}

function SettingsSection({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <div className="settings-section"><div className="section-header"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children}</div>
}
