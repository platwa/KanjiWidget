import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../domain/defaults'
import { finishQuizSession, getAllCards, loadSettings, reviewCard, saveSettings } from '../services/storage'
import { SettingsScreen } from './SettingsScreen'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('review settings', () => {
  it('refreshes deck counters after a review without reopening settings', async () => {
    const view = render(<SettingsScreen />)
    fireEvent.click(await view.findByRole('button', { name: /^Decks$/ }))
    const deck = (await view.findByText('JLPT N5')).closest('article')!
    await waitFor(() => expect(deck.querySelector('.deck-stats')).toHaveTextContent('80 new'))
    const card = getAllCards().find((item) => item.jlpt === 'N5')!
    await act(async () => {
      await reviewCard(card.id, 4, DEFAULT_SETTINGS)
      await finishQuizSession(DEFAULT_SETTINGS, [card.id])
    })
    await waitFor(() => expect(deck.querySelector('.deck-stats')).toHaveTextContent('79 new'))
    expect(deck.querySelector('.deck-stats')).toHaveTextContent('1 reviewing')
  })

  it('saves the reminder preference and opens a review from its own tab', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, language: 'ru' })
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const view = render(<SettingsScreen />)
    fireEvent.click(await view.findByRole('button', { name: /^Тест$/ }))
    expect(view.getByText('Вы ещё не завершили тест по этой колоде.')).toBeVisible()
    const reminder = view.getByRole('checkbox')
    expect(reminder).toBeChecked()
    fireEvent.click(reminder)
    fireEvent.click(view.getByRole('button', { name: 'Сохранить и начать тест' }))
    await waitFor(() => expect(open).toHaveBeenCalledWith(expect.stringContaining('view=quiz'), 'kanjiwidget-quiz', expect.any(String)))
    expect((await loadSettings()).reviewReminder).toBe(false)
  })
})
