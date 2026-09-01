import { useState } from 'react'
import { AlertCircle, CheckCircle2, FileArchive, LoaderCircle, Upload, X } from 'lucide-react'
import type { AnkiFieldMapping, AnkiPackagePreview } from '../domain/types'
import type { Language } from '../i18n'
import { localizedError, tx } from '../i18n'
import {
  importAnkiCards, inspectAnkiPackage, pickAnkiPackage,
} from '../services/platform'
import { saveImportedDeck } from '../services/storage'

export function AnkiImportPanel({ language, onImported }: {
  language: Language
  onImported: (deckId: string, message: string) => void
}) {
  const [path, setPath] = useState('')
  const [preview, setPreview] = useState<AnkiPackagePreview | null>(null)
  const [mapping, setMapping] = useState<AnkiFieldMapping | null>(null)
  const [deckName, setDeckName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reset = () => {
    setPath('')
    setPreview(null)
    setMapping(null)
    setDeckName('')
    setError('')
  }

  const chooseFile = async () => {
    const selected = await pickAnkiPackage(language)
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      const inspected = await inspectAnkiPackage(selected)
      setPath(selected)
      setPreview(inspected)
      setDeckName(inspected.deckName)
      setMapping(inspected.noteTypes[0].suggested)
    } catch (reason) {
      setError(localizedError(language, reason))
    } finally {
      setBusy(false)
    }
  }

  const changeNoteType = (id: string) => {
    const noteType = preview?.noteTypes.find((item) => item.id === id)
    if (noteType) setMapping(noteType.suggested)
  }

  const importDeck = async () => {
    if (!preview || !mapping || mapping.headwordField === null) return
    setBusy(true)
    setError('')
    try {
      const cards = await importAnkiCards(path, mapping)
      const result = await saveImportedDeck(deckName, cards)
      const skipped = result.skipped
        ? tx(language, `, duplicates skipped: ${result.skipped}`, `, пропущено дублей: ${result.skipped}`)
        : ''
      onImported(result.deck.id, tx(language, `Cards imported: ${result.imported}${skipped}`, `Импортировано карточек: ${result.imported}${skipped}`))
      reset()
    } catch (reason) {
      setError(localizedError(language, reason))
    } finally {
      setBusy(false)
    }
  }

  if (!preview || !mapping) {
    return (
      <div className="anki-import-card">
        <div className="anki-import-copy">
          <span className="anki-icon"><FileArchive size={20} /></span>
          <span><strong>{tx(language, 'Import from Anki', 'Импорт из Anki')}</strong><small>{tx(language, 'Kanji, readings, meanings and examples from an .apkg file. Media files are not copied.', 'Кандзи, чтения, значения и примеры из файла .apkg. Медиафайлы не копируются.')}</small></span>
        </div>
        <button className="secondary-button" type="button" disabled={busy} onClick={chooseFile}>
          {busy ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />}{tx(language, 'Choose .apkg', 'Выбрать .apkg')}
        </button>
        {error && <div className="import-error"><AlertCircle size={14} />{error}</div>}
      </div>
    )
  }

  const noteType = preview.noteTypes.find((item) => item.id === mapping.noteTypeId) ?? preview.noteTypes[0]
  return (
    <div className="anki-mapping-card">
      <div className="anki-mapping-head">
        <div><span className="eyebrow">{preview.format}</span><strong>{path.split(/[\\/]/).pop()}</strong><small>{tx(language, `${preview.totalNotes} notes found`, `${preview.totalNotes} заметок найдено`)}</small></div>
        <button type="button" onClick={reset} aria-label={tx(language, 'Cancel import', 'Отменить импорт')}><X size={17} /></button>
      </div>
      <div className="anki-field-grid">
        <label><span>{tx(language, 'Deck name', 'Название колоды')}</span><input value={deckName} maxLength={80} onChange={(event) => setDeckName(event.target.value)} /></label>
        <label><span>{tx(language, 'Note type', 'Тип заметок')}</span><select value={mapping.noteTypeId} onChange={(event) => changeNoteType(event.target.value)}>
          {preview.noteTypes.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.noteCount}</option>)}
        </select></label>
        <FieldMapping language={language} label={tx(language, 'Kanji or word', 'Кандзи или слово')} required fields={noteType.fields} value={mapping.headwordField} onChange={(value) => setMapping({ ...mapping, headwordField: value })} />
        <FieldMapping language={language} label={tx(language, 'Reading', 'Чтение')} fields={noteType.fields} value={mapping.readingField} onChange={(value) => setMapping({ ...mapping, readingField: value })} />
        <FieldMapping language={language} label={tx(language, 'Meaning', 'Значение')} fields={noteType.fields} value={mapping.meaningField} onChange={(value) => setMapping({ ...mapping, meaningField: value })} />
        <FieldMapping language={language} label={tx(language, 'Sentence', 'Предложение')} fields={noteType.fields} value={mapping.sentenceField} onChange={(value) => setMapping({ ...mapping, sentenceField: value })} />
        <FieldMapping language={language} label={tx(language, 'Sentence reading', 'Чтение предложения')} fields={noteType.fields} value={mapping.sentenceReadingField} onChange={(value) => setMapping({ ...mapping, sentenceReadingField: value })} />
        <FieldMapping language={language} label={tx(language, 'Sentence translation', 'Перевод предложения')} fields={noteType.fields} value={mapping.sentenceMeaningField} onChange={(value) => setMapping({ ...mapping, sentenceMeaningField: value })} />
      </div>
      <div className="anki-import-footer">
        <span><CheckCircle2 size={14} />{tx(language, 'Fields were detected automatically — please review them before importing', 'Поля определены автоматически — проверьте перед импортом')}</span>
        <button className="primary-button" type="button" disabled={busy || !deckName.trim() || mapping.headwordField === null} onClick={importDeck}>
          {busy ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />}{tx(language, 'Import', 'Импортировать')}
        </button>
      </div>
      {error && <div className="import-error"><AlertCircle size={14} />{error}</div>}
    </div>
  )
}

function FieldMapping({ language, label, required = false, fields, value, onChange }: {
  language: Language
  label: string
  required?: boolean
  fields: string[]
  value: number | null
  onChange: (value: number | null) => void
}) {
  return (
    <label><span>{label}{required && <b> *</b>}</span><select value={value ?? ''} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}>
      <option value="">{tx(language, 'Do not import', 'Не импортировать')}</option>
      {fields.map((field, index) => <option key={`${field}-${index}`} value={index}>{field}</option>)}
    </select></label>
  )
}
