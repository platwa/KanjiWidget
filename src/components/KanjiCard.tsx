import type { AppSettings, Card } from '../domain/types'
import { RubyText } from './RubyText'

export function KanjiCard({ card, settings, concealed = false, compact = false }: {
  card: Card
  settings: AppSettings
  concealed?: boolean
  compact?: boolean
}) {
  const meaning = settings.language === 'ru' ? card.meaning_ru : card.meaning_en
  const example = card.examples.find((item) => item.sentence)
  const exampleTranslation = example
    ? (settings.language === 'ru' ? example.sentence_ru : example.sentence_en)
    : ''
  return (
    <div className={`kanji-card-content ${concealed ? 'concealed' : ''} ${compact ? 'compact' : ''}`}>
      <div className="furigana">{!concealed && settings.showFurigana ? card.furigana : '\u00a0'}</div>
      <div className="kanji-glyph">{card.kanji}</div>
      <div className="reading-stack" aria-hidden={concealed}>
        {settings.showOnyomi && <div className="reading onyomi"><span>音</span>{card.onyomi.join('、') || '—'}</div>}
        {settings.showKunyomi && <div className="reading kunyomi"><span>訓</span>{card.kunyomi.join('、') || '—'}</div>}
      </div>
      <div className="meaning" aria-hidden={concealed}>{meaning}</div>
      {example?.sentence && (
        <div className="usage-example" aria-hidden={concealed}>
          <div className="usage-sentence"><RubyText text={example.sentence} segments={example.ruby} fallbackReading={example.sentence_reading} target={card.kanji} /></div>
          {exampleTranslation && <div className="usage-translation">{exampleTranslation}</div>}
        </div>
      )}
    </div>
  )
}
