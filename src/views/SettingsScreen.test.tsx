import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../domain/defaults'
import { loadSettings, saveSettings } from '../services/storage'
import { SettingsScreen } from './SettingsScreen'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('review settings', () => {
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
