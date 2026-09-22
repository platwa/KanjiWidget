import type { AppSettings, Card } from '../domain/types'
import { RubyText } from './RubyText'
import { FittedHeadword } from './FittedHeadword'
import { romanizeKana } from '../services/romanize'

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
      <div className="pronunciation" aria-hidden={answersHidden}>
        <div className="furigana">{!answersHidden && settings.showFurigana ? card.furigana : '\u00a0'}</div>
        {settings.showRomaji && <div className="romaji" lang="en">{!answersHidden ? romanizeKana(card.furigana) : '\u00a0'}</div>}
      </div>
      <FittedHeadword className="kanji-glyph" text={card.kanji} sizeKey={`${settings.fontSize}:${concealment}`} />
      <div className="reading-stack" aria-hidden={answersHidden}>
        {settings.showOnyomi && card.onyomi.length > 0 && <div className="reading onyomi"><span>音</span>{card.onyomi.join('、')}</div>}
        {settings.showKunyomi && card.kunyomi.length > 0 && <div className="reading kunyomi"><span>訓</span>{card.kunyomi.join('、')}</div>}
      </div>
      <div className="meaning" aria-hidden={answersHidden}>{meaning}</div>
      {example?.sentence && (
        <div className="usage-example" aria-hidden={exampleHidden}>
          <div className="usage-sentence"><RubyText text={example.sentence} segments={example.ruby} fallbackReading={example.sentence_reading} target={card.kanji} showReadings={!answersHidden} /></div>
          {exampleTranslation && <div className="usage-translation" aria-hidden={answersHidden}>{exampleTranslation}</div>}
        </div>
      )}
    </div>
  )
}
