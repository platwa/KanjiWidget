import { DEFAULT_SETTINGS } from './defaults'
import type { AppSettings } from './types'

export function normalizeSettings(value: unknown): AppSettings {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const result = { ...DEFAULT_SETTINGS, questionTypes: [...DEFAULT_SETTINGS.questionTypes] }
  for (const key of ['showOnyomi', 'showKunyomi', 'showFurigana', 'showRomaji', 'alwaysOnTop', 'autostart', 'lockscreenExport'] as const) {
    if (typeof source[key] === 'boolean') result[key] = source[key]
  }
  for (const [key, min, max] of [
    ['poolSize', 1, 20], ['rotateIntervalSec', 30, 3600],
    ['opacity', 0.5, 1], ['requestRetention', 0.7, 0.99],
  ] as const) {
    const candidate = source[key]
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      result[key] = Math.max(min, Math.min(max, candidate))
    }
  }
  result.poolSize = Math.floor(result.poolSize)
  if (source.language === 'en' || source.language === 'ru') result.language = source.language
  if (source.theme === 'dark' || source.theme === 'light' || source.theme === 'auto') result.theme = source.theme
  if (source.fontSize === 'sm' || source.fontSize === 'md' || source.fontSize === 'lg') result.fontSize = source.fontSize
  if (source.displayMode === 'full' || source.displayMode === 'active-recall' || source.displayMode === 'quiz') result.displayMode = source.displayMode
  if (typeof source.poolRefreshTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(source.poolRefreshTime)) result.poolRefreshTime = source.poolRefreshTime
  if (typeof source.deckId === 'string' && source.deckId.trim()) result.deckId = source.deckId.trim()
  if (typeof source.lockscreenFolder === 'string' && source.lockscreenFolder.trim()) result.lockscreenFolder = source.lockscreenFolder
  if (typeof source.hotkey === 'string' && source.hotkey.trim()) result.hotkey = source.hotkey
  if (Array.isArray(source.questionTypes)) {
    const known = new Set(['kanji-meaning', 'meaning-kanji', 'kanji-reading', 'onyomi-kanji'])
    const types = source.questionTypes.filter((item): item is AppSettings['questionTypes'][number] => typeof item === 'string' && known.has(item))
    if (types.length) result.questionTypes = [...new Set(types)]
  }
  return result
}
