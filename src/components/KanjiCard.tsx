import type { AppSettings, Card } from '../domain/types'
import { RubyText } from './RubyText'

type Concealment = 'none' | 'all' | 'answers'

export function KanjiCard({ card, settings, concealment = 'none', compact = false }: {
  card: Card
  settings: AppSettings
  concealment?: Concealment
  compact?: boolean
}) {
  const answersHidden = concealment !== 'none'
  const exampleHidden = concealment === 'all'
  const meaning = settings.language === 'ru' ? card.meaning_ru : card.meaning_en
  const example = card.examples.find((item) => item.sentence)
  const exampleTranslation = example
    ? (settings.language === 'ru' ? example.sentence_ru : example.sentence_en)
    : ''
  return (
    <div className={`kanji-card-content concealed-${concealment} ${compact ? 'compact' : ''}`}>
      <div className="furigana" aria-hidden={answersHidden}>{!answersHidden && settings.showFurigana ? card.furigana : '\u00a0'}</div>
      <div className="kanji-glyph">{card.kanji}</div>
      <div className="reading-stack" aria-hidden={answersHidden}>
        {settings.showOnyomi && <div className="reading onyomi"><span>音</span>{card.onyomi.join('、') || '—'}</div>}
        {settings.showKunyomi && <div className="reading kunyomi"><span>訓</span>{card.kunyomi.join('、') || '—'}</div>}
      </div>
      <div className="meaning" aria-hidden={answersHidden}>{meaning}</div>
      {example?.sentence && (
        <div className="usage-example" aria-hidden={exampleHidden}>
          <div className="usage-sentence"><RubyText text={example.sentence} segments={example.ruby} fallbackReading={example.sentence_reading} target={card.kanji} /></div>
          {exampleTranslation && <div className="usage-translation" aria-hidden={answersHidden}>{exampleTranslation}</div>}
        </div>
      )}
    </div>
  )
}
