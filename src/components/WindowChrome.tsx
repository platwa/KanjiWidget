import { Minus, X } from 'lucide-react'
import type { Language } from '../i18n'
import { tx } from '../i18n'
import { closeCurrentWindow, minimizeCurrentWindow } from '../services/platform'

interface WindowChromeProps {
  eyebrow: string
  title: string
  trailing?: React.ReactNode
  onClose?: () => void
  language?: Language
}

export function WindowChrome({ eyebrow, title, trailing, onClose, language = 'en' }: WindowChromeProps) {
  return (
    <header className="window-chrome" data-tauri-drag-region>
      <div className="window-brand" data-tauri-drag-region>
        <span className="brand-mark" aria-hidden="true">字</span>
        <div data-tauri-drag-region>
          <span className="eyebrow">{eyebrow}</span>
          <strong>{title}</strong>
        </div>
      </div>
      <div className="window-actions">
        {trailing}
        <button className="chrome-button" type="button" aria-label={tx(language, 'Minimize', 'Свернуть')} onClick={minimizeCurrentWindow}>
          <Minus size={17} />
        </button>
        <button className="chrome-button chrome-close" type="button" aria-label={tx(language, 'Close', 'Закрыть')} onClick={onClose ?? closeCurrentWindow}>
          <X size={17} />
        </button>
      </div>
    </header>
  )
}
