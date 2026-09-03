# Microsoft Store submission

KanjiWidget is submitted as a Win32 NSIS application. Store builds use
`src-tauri/tauri.microsoftstore.conf.json`, which embeds the offline WebView2
installer and sets a publisher distinct from the product name.

Build the Store installer with:

```powershell
pnpm tauri build --config src-tauri/tauri.microsoftstore.conf.json
```

The silent install argument entered in Partner Center is `/S`.

## English (United States)

Short description:

> Learn Japanese kanji without leaving your desktop. A free, offline widget with FSRS reviews, Active Recall, furigana, editable decks, and Anki .apkg import.

Description:

> KanjiWidget keeps Japanese study visible while you work, so reviews happen naturally instead of waiting for you to open another app.
>
> A compact, always-on-top desktop card shows a kanji and an example sentence. In Active Recall mode, readings, meanings, and translations stay hidden until you hover over the card, giving you time to remember first.
>
> Features:
> - Built-in JLPT N5 and N4 decks
> - FSRS spaced-repetition reviews
> - Active Recall mode with hover-to-reveal answers
> - Furigana and natural example sentences
> - Import compatible cards from Anki .apkg packages
> - Create, edit, search, and delete custom cards and decks
> - Adjustable kanji and furigana sizes
> - English and Russian interface
> - Core study works offline — no account, ads, analytics, or telemetry
> - Free and open source under Apache 2.0
>
> KanjiWidget is designed for Windows 10 and 11.

## Russian (Russia)

Short description:

> Учите японские кандзи прямо на рабочем столе. Бесплатный офлайн-виджет с повторениями FSRS, активным запоминанием, фуриганой, редактируемыми колодами и импортом Anki .apkg.

Description:

> KanjiWidget оставляет изучение японского языка перед глазами во время работы, поэтому повторения происходят естественно — не нужно каждый раз заставлять себя открывать отдельное приложение.
>
> Компактная карточка поверх окон показывает кандзи и пример употребления. В режиме активного запоминания чтения, значение и перевод скрыты до наведения курсора, чтобы сначала попробовать вспомнить ответ самостоятельно.
>
> Возможности:
> - Встроенные колоды JLPT N5 и N4
> - Интервальные повторения по алгоритму FSRS
> - Режим активного запоминания с ответом при наведении
> - Фуригана и примеры употребления
> - Импорт совместимых карточек из колод Anki .apkg
> - Создание, поиск, редактирование и удаление карточек и колод
> - Настройка размеров кандзи и фуриганы
> - Русский и английский интерфейс
> - Основные функции работают без интернета — без аккаунта, рекламы, аналитики и телеметрии
> - Бесплатный открытый исходный код под лицензией Apache 2.0
>
> KanjiWidget предназначен для Windows 10 и 11.
