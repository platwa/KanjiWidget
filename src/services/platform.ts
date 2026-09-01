import type {
  AnkiFieldMapping, AnkiPackagePreview, AppSettings, Card, ImportedAnkiCard,
} from '../domain/types'

type WidgetWindow = Pick<import('@tauri-apps/api/window').Window, 'setPosition'>

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export async function emitAppEvent(name: string, payload?: unknown) {
  if (!isTauri()) {
    window.dispatchEvent(new CustomEvent(name, { detail: payload }))
    return
  }
  const { emit } = await import('@tauri-apps/api/event')
  await emit(name, payload)
}

export async function listenAppEvent<T = void>(name: string, callback: (payload: T) => void) {
  if (!isTauri()) {
    const handler = (event: Event) => callback((event as CustomEvent<T>).detail)
    window.addEventListener(name, handler)
    return () => window.removeEventListener(name, handler)
  }
  const { listen } = await import('@tauri-apps/api/event')
  return listen<T>(name, (event) => callback(event.payload))
}

export async function openAppWindow(view: 'quiz' | 'settings') {
  if (!isTauri()) {
    window.open(`${window.location.origin}/?view=${view}`, `kanjiwidget-${view}`, 'width=960,height=700')
    return
  }
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('show_app_window', { view })
}

export async function openCardEditor(deckId: string, cardId: string) {
  if (!isTauri()) {
    const params = new URLSearchParams({ view: 'settings', section: 'decks', deckId, cardId })
    window.open(`${window.location.origin}/?${params}`, 'kanjiwidget-settings', 'width=1040,height=760')
    return
  }
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('show_card_editor', { deckId, cardId })
}

export async function closeCurrentWindow() {
  if (!isTauri()) {
    window.close()
    return
  }
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const current = getCurrentWindow()
  if (current.label === 'main') await current.hide()
  else await current.close()
}

export async function exitApplication() {
  if (!isTauri()) {
    window.close()
    return
  }
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('quit_app')
}

export async function setNativeLanguage(language: AppSettings['language']) {
  if (!isTauri()) return
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('set_native_language', { language })
}

export async function minimizeCurrentWindow() {
  if (!isTauri()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().minimize()
}

export async function applyWidgetWindowSettings(settings: AppSettings) {
  if (!isTauri()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const current = getCurrentWindow()
  if (current.label !== 'main') return
  await current.setAlwaysOnTop(settings.alwaysOnTop)
  await current.setShadow(false).catch(() => undefined)
}

export async function startWidgetResize() {
  if (!isTauri()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().startResizeDragging('SouthEast')
}

type WidgetDragState = {
  generation: number
  startScreenX: number
  startScreenY: number
  latestScreenX: number
  latestScreenY: number
  originX?: number
  originY?: number
  scaleFactor?: number
  window?: WidgetWindow
  moving: boolean
}

let widgetDragGeneration = 0
let widgetDragState: WidgetDragState | null = null

async function flushWidgetDrag(state: WidgetDragState) {
  if (state.moving || !state.window || state.originX === undefined || state.originY === undefined || state.scaleFactor === undefined) return
  state.moving = true
  try {
    while (widgetDragState === state && state.generation === widgetDragGeneration) {
      const screenX = state.latestScreenX
      const screenY = state.latestScreenY
      const targetX = Math.round(state.originX + (screenX - state.startScreenX) * state.scaleFactor)
      const targetY = Math.round(state.originY + (screenY - state.startScreenY) * state.scaleFactor)
      const { PhysicalPosition } = await import('@tauri-apps/api/dpi')
      await state.window.setPosition(new PhysicalPosition(targetX, targetY))
      if (screenX === state.latestScreenX && screenY === state.latestScreenY) break
    }
  } finally {
    state.moving = false
  }
}

export async function beginWidgetDrag(screenX: number, screenY: number) {
  if (!isTauri()) return
  const generation = ++widgetDragGeneration
  const state: WidgetDragState = {
    generation,
    startScreenX: screenX,
    startScreenY: screenY,
    latestScreenX: screenX,
    latestScreenY: screenY,
    moving: false,
  }
  widgetDragState = state
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const current = getCurrentWindow()
  const [position, scaleFactor] = await Promise.all([current.outerPosition(), current.scaleFactor()])
  if (widgetDragState !== state || generation !== widgetDragGeneration) return
  state.window = current
  state.originX = position.x
  state.originY = position.y
  state.scaleFactor = scaleFactor
  await flushWidgetDrag(state)
}

export function moveWidgetDrag(screenX: number, screenY: number) {
  const state = widgetDragState
  if (!state) return
  state.latestScreenX = screenX
  state.latestScreenY = screenY
  void flushWidgetDrag(state)
}

export function endWidgetDrag() {
  widgetDragGeneration += 1
  widgetDragState = null
}

export async function pickAnkiPackage(language: AppSettings['language'] = 'en') {
  if (!isTauri()) return null
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selection = await open({
    multiple: false,
    directory: false,
    title: language === 'ru' ? 'Импорт колоды Anki' : 'Import Anki deck',
    filters: [{ name: language === 'ru' ? 'Колода Anki' : 'Anki deck', extensions: ['apkg'] }],
  })
  return typeof selection === 'string' ? selection : null
}

export async function inspectAnkiPackage(path: string) {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<AnkiPackagePreview>('inspect_anki_package', { path })
}

export async function importAnkiCards(path: string, mapping: AnkiFieldMapping) {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<ImportedAnkiCard[]>('import_anki_cards', { path, mapping })
}

export async function setAutostart(enabled: boolean) {
  if (!isTauri()) return
  const autostart = await import('@tauri-apps/plugin-autostart')
  const current = await autostart.isEnabled()
  if (enabled && !current) await autostart.enable()
  if (!enabled && current) await autostart.disable()
}

export async function pickLockscreenFolder(language: AppSettings['language'] = 'en') {
  if (!isTauri()) return null
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selection = await open({
    directory: true,
    multiple: false,
    title: language === 'ru' ? 'Папка изображений экрана блокировки' : 'Lock screen slideshow folder',
  })
  return typeof selection === 'string' ? selection : null
}

export async function exportLockscreenCard(card: Card, settings: AppSettings) {
  if (!isTauri() || !settings.lockscreenExport || !settings.lockscreenFolder) return
  const { invoke } = await import('@tauri-apps/api/core')
  await document.fonts.ready
  const canvas = document.createElement('canvas')
  canvas.width = 1920
  canvas.height = 1080
  const context = canvas.getContext('2d')
  if (!context) return

  const gradient = context.createLinearGradient(0, 0, 1920, 1080)
  gradient.addColorStop(0, '#0b0d14')
  gradient.addColorStop(0.55, '#111622')
  gradient.addColorStop(1, '#151124')
  context.fillStyle = gradient
  context.fillRect(0, 0, 1920, 1080)
  context.strokeStyle = 'rgba(255,255,255,.08)'
  context.lineWidth = 1
  context.beginPath()
  context.arc(1560, 180, 420, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.arc(180, 930, 340, 0, Math.PI * 2)
  context.stroke()

  context.textAlign = 'center'
  context.fillStyle = 'rgba(255,255,255,.54)'
  context.font = '32px "Noto Sans JP", sans-serif'
  context.fillText(settings.showFurigana ? card.furigana : '', 960, 300)
  context.fillStyle = '#f7f2e8'
  context.font = '360px "Noto Serif JP", serif'
  context.fillText(card.kanji, 960, 660)
  context.fillStyle = '#cbc8d2'
  context.font = '42px "Noto Sans JP", sans-serif'
  context.fillText(settings.language === 'ru' ? card.meaning_ru : card.meaning_en, 960, 820)
  context.fillStyle = 'rgba(255,255,255,.34)'
  context.font = '24px "Noto Sans JP", sans-serif'
  context.fillText(`KANJIWIDGET  ·  ${card.jlpt ?? ''}`, 960, 982)

  const dataUrl = canvas.toDataURL('image/png')
  const bytes = Array.from(Uint8Array.from(atob(dataUrl.split(',')[1]), (value) => value.charCodeAt(0)))
  await invoke('write_lockscreen_png', {
    folder: settings.lockscreenFolder,
    fileName: `kanjiwidget-${card.kanji.codePointAt(0)?.toString(16)}.png`,
    bytes,
  })
}

export async function openExternal(url: string) {
  if (!isTauri()) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  const { openUrl } = await import('@tauri-apps/plugin-opener')
  await openUrl(url)
}
