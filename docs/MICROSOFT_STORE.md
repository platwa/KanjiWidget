# Microsoft Store submission

The existing Partner Center product is an **unpublished EXE/MSI draft**. It has
not been converted to MSIX, deleted, or replaced. Do not upload a package or
submit for certification until the owner has tested and approved the new build.

The MSIX path is under compatibility testing. Microsoft signs MSIX packages
after Store certification, so this path does not depend on SignPath approval.
The existing EXE/MSI product does not expose an MSIX upload or conversion control.
Resolve the product type/name with the owner or Store support before reserving a
second product or deleting the original draft.

## Build and identity

`scripts/build-msix.ps1` packages the compiled Windows executable, license files,
icons, and a disabled-by-default Windows StartupTask. Use the **exact** Identity
Name, Publisher, and PublisherDisplayName from the MSIX product identity page.
These values are not the Tauri application identifier or the old Win32 product ID.

Example (replace the identity values with those from Partner Center):

```powershell
pnpm tauri build --no-bundle
./scripts/build-msix.ps1 -ExecutablePath src-tauri/target/release/kanji-widget.exe `
  -IdentityName 'IDENTITY-FROM-PARTNER-CENTER' `
  -Publisher 'CN=PUBLISHER-FROM-PARTNER-CENTER' `
  -PublisherDisplayName 'PUBLISHER-DISPLAY-NAME'
```

The current local compatibility identity is `KanjiWidget.MsixCompatibilityTest`.
It must never be uploaded as a production Store package. Temporary certificates
are for local tests only; private keys must not enter Git or CI artifacts.
The test executable uses `tauri.msix-test.conf.json` and a separate application
data identifier, `com.kanjiwidget.msix-test`, so manual testing does not edit the
web installation's settings, decks, or progress. A copy of the study database can
be seeded into that test profile before its first launch.

The `msix_compatibility_test` option in the Windows workflow builds an unsigned
test MSIX and executable from the selected branch without creating a release.

## Before Store upload

- The owner has tested the exact build and approved upload.
- The correct MSIX product identity is reserved and substituted in the manifest.
- Launch, tray, card rotation, review, import, editing, settings, and restart persistence pass in an installed package.
- The StartupTask can be enabled and disabled, and Windows' user-disabled state is respected.
- Test upgrade and uninstall behavior without losing or deleting the separate web installation's study data.
- Validate WebView2 on the minimum supported clean Windows image. The compatibility package uses the installed Evergreen runtime. Do not assume that an MSIX ExternalDependency will install it through the Store: Microsoft documents that mechanism for App Installer only. Resolve missing-runtime delivery before certification.
- Run Windows App Certification Kit against the final package.
- Prepare English and Russian screenshots from the exact build.
- Declare `runFullTrust` for the desktop widget, tray, global shortcut, local Anki import, and user-selected lock-screen image export. There are no accounts, analytics, or telemetry.

References: [Store signing](https://learn.microsoft.com/en-us/windows/apps/publish/faq/get-started-with-the-microsoft-store),
[StartupTask](https://learn.microsoft.com/en-us/uwp/api/windows.applicationmodel.startuptask),
[WebView2 delivery](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution),
[ExternalDependency scope](https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-win32dependencies-externaldependency).

## English (United States)

Short description:

> Keep Japanese words and kanji on your Windows desktop. Free, offline, with readings, examples, Anki deck import, and spaced-repetition reviews.

Description:

> Keep Japanese vocabulary in sight while you work or study on your computer.
>
> A compact desktop widget shows a Japanese word or kanji with its reading, meaning, and example sentence. Import text from your own Anki .apkg deck or create cards yourself. In Active Recall mode, answer details and example readings stay hidden until you hover, giving you time to recall the word first.
>
> Features:
> - Built-in JLPT N5 and N4 decks
> - Full vocabulary cards, including words written only in kana
> - Optional modified Hepburn rōmaji pronunciation hints
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

> Японские слова и кандзи на рабочем столе Windows. Бесплатный офлайн-виджет с чтениями, примерами, импортом Anki и интервальными повторениями.

Description:

> Держите японскую лексику перед глазами во время работы или учёбы за компьютером.
>
> Компактный виджет показывает японское слово или кандзи вместе с чтением, переводом и примером предложения. Импортируйте текст из своей колоды Anki .apkg или создавайте собственные карточки. В режиме активного вспоминания ответ и чтения в примере скрыты до наведения курсора, чтобы сначала попробовать вспомнить слово самостоятельно.
>
> Возможности:
> - Встроенные колоды JLPT N5 и N4
> - Карточки с полноценными словами, в том числе записанными только каной
> - Необязательные подсказки ромадзи по модифицированной системе Хэпбёрна
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
