import { createEmptyCard, fsrs, generatorParameters, type Card as FsrsCard, type Grade } from 'ts-fsrs'
import type { PersistedCardState } from '../domain/types'

export function createNewState(cardId: string, now = new Date()): PersistedCardState {
  return fromFsrsCard(cardId, createEmptyCard(now))
}

function toFsrsCard(state: PersistedCardState): FsrsCard {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsed_days,
    scheduled_days: state.scheduled_days,
    learning_steps: state.learning_steps,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state,
    last_review: state.last_review ? new Date(state.last_review) : undefined,
  } as FsrsCard
}

function fromFsrsCard(cardId: string, card: FsrsCard): PersistedCardState {
  return {
    card_id: cardId,
    due: new Date(card.due).toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: Number(card.state),
    last_review: card.last_review ? new Date(card.last_review).toISOString() : null,
  }
}

export function reviewState(
  state: PersistedCardState,
  rating: 1 | 2 | 3 | 4,
  retention: number,
  now = new Date(),
) {
  const scheduler = fsrs(generatorParameters({ request_retention: retention }))
  const result = scheduler.next(toFsrsCard(state), now, rating as Grade)
  return fromFsrsCard(state.card_id, result.card)
}

export function previewIntervals(state: PersistedCardState, retention: number, now = new Date()) {
  const scheduler = fsrs(generatorParameters({ request_retention: retention }))
  const preview = scheduler.repeat(toFsrsCard(state), now)
  return ([1, 2, 3, 4] as const).reduce<Record<number, string>>((result, rating) => {
    result[rating] = new Date(preview[rating].card.due).toISOString()
    return result
  }, {})
}

export function formatDueInterval(isoDate: string, now = new Date()) {
  const minutes = Math.max(1, Math.round((new Date(isoDate).getTime() - now.getTime()) / 60_000))
  if (minutes < 60) return `${minutes} мин`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ч`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} дн`
  const months = Math.round(days / 30)
  if (months < 12) return `${months} мес`
  return `${Math.round(months / 12)} г`
}
