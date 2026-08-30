import { describe, expect, it } from 'vitest'
import { createNewState, formatDueInterval, previewIntervals, reviewState } from './scheduler'

describe('FSRS scheduler', () => {
  const now = new Date('2026-08-29T09:00:00.000Z')

  it('creates a valid new card state', () => {
    const state = createNewState('card-1', now)
    expect(state.card_id).toBe('card-1')
    expect(state.state).toBe(0)
    expect(state.reps).toBe(0)
    expect(state.due).toBe(now.toISOString())
  })

  it('schedules all four rating outcomes', () => {
    const state = createNewState('card-1', now)
    const preview = previewIntervals(state, 0.9, now)
    expect(Object.keys(preview)).toEqual(['1', '2', '3', '4'])
    expect(new Date(preview[1]).getTime()).toBeGreaterThan(now.getTime())
    expect(new Date(preview[4]).getTime()).toBeGreaterThanOrEqual(new Date(preview[3]).getTime())
  })

  it('persists the result of a review', () => {
    const state = createNewState('card-1', now)
    const reviewed = reviewState(state, 3, 0.9, now)
    expect(reviewed.reps).toBe(1)
    expect(reviewed.last_review).toBe(now.toISOString())
    expect(new Date(reviewed.due).getTime()).toBeGreaterThan(now.getTime())
  })

  it('formats human readable intervals', () => {
    expect(formatDueInterval('2026-08-29T09:20:00.000Z', now)).toBe('20 мин')
    expect(formatDueInterval('2026-08-31T09:00:00.000Z', now)).toBe('2 дн')
  })
})
