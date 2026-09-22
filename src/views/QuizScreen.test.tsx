import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../domain/defaults'
import type { Card } from '../domain/types'
import { createNewState } from '../services/scheduler'
import { QuizScreen } from './QuizScreen'

const storage = vi.hoisted(() => ({
  buildQuizPool: vi.fn(), finishQuizSession: vi.fn(), getOrCreateState: vi.fn(),
  loadSettings: vi.fn(), reviewCard: vi.fn(),
}))
vi.mock('../services/storage', () => storage)

const card: Card = {
  id: 'old', kanji: '見える', furigana: 'みえる', onyomi: [], kunyomi: [],
  meaning_en: 'visible', meaning_ru: 'видеть', jlpt: null, grade: null, strokes: null, tags: [], examples: [],
}

beforeEach(() => {
  storage.loadSettings.mockResolvedValue(DEFAULT_SETTINGS)
  storage.buildQuizPool.mockResolvedValue([card])
  storage.finishQuizSession.mockResolvedValue(undefined)
  storage.getOrCreateState.mockImplementation(async (id: string) => createNewState(id))
})
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.restoreAllMocks() })

describe('review session transitions', () => {
  it('waits for a pending rating and flushes the pool before native close', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})
    let resolveReview!: (state: ReturnType<typeof createNewState>) => void
    storage.reviewCard.mockReturnValue(new Promise((resolve) => { resolveReview = resolve }))
    const view = render(<QuizScreen />)
    fireEvent.click(await view.findByRole('button', { name: 'Show answer' }))
    await waitFor(() => expect(view.container.querySelector('.rating-4')).toBeInTheDocument())
    fireEvent.keyDown(window, { key: '4' })
    await waitFor(() => expect(storage.reviewCard).toHaveBeenCalledTimes(1))
    act(() => { window.dispatchEvent(new CustomEvent('kanjiwidget:quiz-close-requested')) })
    expect(close).not.toHaveBeenCalled()
    await act(async () => { resolveReview(createNewState(card.id)) })
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
    expect(storage.finishQuizSession).toHaveBeenCalledWith(DEFAULT_SETTINGS, ['old'])
  })

  it('waits for an in-flight rating before restarting and does not consume a new card', async () => {
    let resolveReview!: (state: ReturnType<typeof createNewState>) => void
    storage.reviewCard.mockReturnValue(new Promise((resolve) => { resolveReview = resolve }))
    const nextCard = { ...card, id: 'next', kanji: 'ありがとう' }
    storage.buildQuizPool.mockResolvedValueOnce([card]).mockResolvedValue([nextCard])
    const view = render(<QuizScreen />)
    fireEvent.click(await view.findByRole('button', { name: 'Show answer' }))
    await waitFor(() => expect(view.container.querySelector('.rating-4')).toBeInTheDocument())
    fireEvent.keyDown(window, { key: '4' })
    await waitFor(() => expect(storage.reviewCard).toHaveBeenCalledTimes(1))
    act(() => { window.dispatchEvent(new CustomEvent('kanjiwidget:quiz-opened')) })
    expect(storage.buildQuizPool).toHaveBeenCalledTimes(1)
    await act(async () => { resolveReview(createNewState(card.id)) })
    await waitFor(() => expect(storage.buildQuizPool).toHaveBeenCalledTimes(2))
    expect(await view.findByText('ありがとう')).toBeVisible()
    expect(storage.finishQuizSession).toHaveBeenCalledWith(DEFAULT_SETTINGS, ['old'])
    expect(view.getByRole('button', { name: 'Show answer' })).toBeVisible()
  })

  it('displays storage failures and allows retrying', async () => {
    storage.buildQuizPool.mockRejectedValueOnce(new Error('Database unavailable'))
    const view = render(<QuizScreen />)
    expect(await view.findByText('Database unavailable')).toBeVisible()
    fireEvent.click(view.getByRole('button', { name: 'Try again' }))
    expect(await view.findByText('見える')).toBeVisible()
  })

  it('accepts rating keys while a button has focus', async () => {
    storage.reviewCard.mockResolvedValue(createNewState(card.id))
    const view = render(<QuizScreen />)
    fireEvent.click(await view.findByRole('button', { name: 'Show answer' }))
    const button = view.getAllByRole('button').find((element) => element.classList.contains('rating-4'))!
    button.focus()
    fireEvent.keyDown(button, { key: '4' })
    await waitFor(() => expect(storage.reviewCard).toHaveBeenCalledTimes(1))
  })
})
