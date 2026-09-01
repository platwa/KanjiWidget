import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../domain/defaults'
import type { Card } from '../domain/types'
import { WidgetView } from './WidgetView'

const storageMocks = vi.hoisted(() => ({
  buildDailyPool: vi.fn(),
  buildQuizPool: vi.fn(),
  loadSettings: vi.fn(),
}))

vi.mock('../services/storage', () => storageMocks)

const card: Card = {
  id: 'test-card',
  kanji: '日',
  onyomi: ['ニチ'],
  kunyomi: ['ひ'],
  furigana: 'にち',
  meaning_ru: 'день',
  meaning_en: 'day',
  jlpt: 'N5',
  grade: 1,
  strokes: 4,
  tags: [],
  examples: [],
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('widget pool updates', () => {
  it('uses only the frozen quiz pool while a test is active', async () => {
    storageMocks.loadSettings.mockResolvedValue(DEFAULT_SETTINGS)
    storageMocks.buildDailyPool.mockResolvedValue([card])
    storageMocks.buildQuizPool.mockResolvedValue([card])

    render(<WidgetView />)
    await waitFor(() => expect(storageMocks.buildDailyPool).toHaveBeenCalledTimes(1))

    act(() => window.dispatchEvent(new CustomEvent('kanjiwidget:quiz-session-started')))
    await waitFor(() => expect(storageMocks.buildQuizPool).toHaveBeenCalledTimes(1))

    act(() => window.dispatchEvent(new CustomEvent('kanjiwidget:pool-changed')))
    await waitFor(() => expect(storageMocks.buildQuizPool).toHaveBeenCalledTimes(2))
    expect(storageMocks.buildDailyPool).toHaveBeenCalledTimes(1)

    act(() => window.dispatchEvent(new CustomEvent('kanjiwidget:quiz-session-ended')))
    await waitFor(() => expect(storageMocks.buildDailyPool).toHaveBeenCalledTimes(2))
  })

  it('refreshes edited card content without changing pool membership', async () => {
    const edited = { ...card, meaning_en: 'sunny day' }
    storageMocks.loadSettings.mockResolvedValue(DEFAULT_SETTINGS)
    storageMocks.buildDailyPool.mockResolvedValueOnce([card]).mockResolvedValue([edited])
    storageMocks.buildQuizPool.mockResolvedValue([edited])

    const view = render(<WidgetView />)
    await waitFor(() => expect(view.getByText('day')).toBeInTheDocument())
    act(() => window.dispatchEvent(new CustomEvent('kanjiwidget:pool-changed')))
    await waitFor(() => expect(view.getByText('sunny day')).toBeInTheDocument())
  })

  it('opens settings from the widget controls', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    storageMocks.loadSettings.mockResolvedValue(DEFAULT_SETTINGS)
    storageMocks.buildDailyPool.mockResolvedValue([card])
    storageMocks.buildQuizPool.mockResolvedValue([card])

    const view = render(<WidgetView />)
    await waitFor(() => expect(storageMocks.buildDailyPool).toHaveBeenCalledTimes(1))
    view.getByRole('button', { name: 'Open settings' }).click()

    expect(openSpy).toHaveBeenCalledWith(
      `${window.location.origin}/?view=settings`,
      'kanjiwidget-settings',
      'width=960,height=700',
    )
    openSpy.mockRestore()
  })
})
