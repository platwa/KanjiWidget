import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, DECKS } from '../domain/defaults'
import { getCardsForDeck, updateCardInDeck } from '../services/storage'
import { CardManager } from './CardManager'

afterEach(cleanup)

describe('card editor preserves examples', () => {
  it('closes a restored draft so saving cannot overwrite the original again', async () => {
    const original = (await getCardsForDeck('jlpt-n5'))[0]
    await updateCardInDeck('jlpt-n5', { ...original, meaning_en: 'edited meaning' })
    const view = render(<CardManager deck={DECKS[0]} settings={DEFAULT_SETTINGS}
      initialCardId={original.id} onClose={() => {}} onChanged={() => {}} onNotice={() => {}} />)
    fireEvent.click(await view.findByRole('button', { name: 'Restore original' }))
    await waitFor(() => expect(view.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument())
    expect((await getCardsForDeck('jlpt-n5')).find((card) => card.id === original.id)?.meaning_en).toBe(original.meaning_en)
  })

  it('removes only the edited sentence, keeping the other vocabulary examples', async () => {
    const original = (await getCardsForDeck('jlpt-n5'))[0]
    expect(original.examples.length).toBeGreaterThan(1)
    const view = render(<CardManager deck={DECKS[0]} settings={DEFAULT_SETTINGS}
      initialCardId={original.id} onClose={() => {}} onChanged={() => {}} onNotice={() => {}} />)
    const example = await view.findByLabelText(/^Example with furigana/)
    fireEvent.change(example, { target: { value: '' } })
    fireEvent.click(view.getByRole('button', { name: /^Save$/ }))
    await waitFor(async () => {
      const saved = (await getCardsForDeck('jlpt-n5')).find((card) => card.id === original.id)!
      expect(saved.examples).toEqual(original.examples.slice(1))
    })
  })

  it('keeps word examples when editing only a card meaning', async () => {
    const original = (await getCardsForDeck('jlpt-n5'))[0]
    const wordsOnly = { ...original, examples: original.examples.filter((example) => !example.sentence) }
    expect(wordsOnly.examples.length).toBeGreaterThan(0)
    await updateCardInDeck('jlpt-n5', wordsOnly)
    const view = render(<CardManager deck={DECKS[0]} settings={DEFAULT_SETTINGS}
      initialCardId={original.id} onClose={() => {}} onChanged={() => {}} onNotice={() => {}} />)
    const meaning = await view.findByLabelText(/Meaning in English/)
    fireEvent.change(meaning, { target: { value: 'updated meaning' } })
    fireEvent.click(view.getByRole('button', { name: /^Save$/ }))
    await waitFor(async () => {
      const saved = (await getCardsForDeck('jlpt-n5')).find((card) => card.id === original.id)!
      expect(saved.meaning_en).toBe('updated meaning')
      expect(saved.examples).toEqual(wordsOnly.examples)
    })
  })
})
