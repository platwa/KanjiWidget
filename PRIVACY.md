# Privacy statement

KanjiWidget is designed for local, offline study.

## Data stored on the computer

The application stores settings, decks, imported card text, review history, and FSRS scheduling state in a local SQLite database. This information is not automatically uploaded or synchronized.

## Network activity

KanjiWidget does not include analytics, telemetry, advertising, an account system, or background synchronization. Core study features work without a network connection.

Once per day while the application is running, KanjiWidget may request the public `latest.json` file from the project's GitHub Releases page to check for a signed update. The request does not include decks, review history, settings, or a device identifier. As with any HTTPS request, GitHub can receive standard connection information such as the user's IP address. If an update is available, KanjiWidget asks before downloading and installing it. Users can also start the same check manually from the About page.

User-initiated actions can open the following external destinations in the default browser or email client:

- the KanjiWidget GitHub repository and issue tracker;
- the Tribute support page;
- a pre-addressed support email to `support.kanjiwidget@gmail.com`.

The application does not attach the local database, imported Anki packages, or review history to those actions.

## Anki imports

When a user imports an `.apkg` file, KanjiWidget reads the card text needed by the application. Images and other media are not copied. Imported content remains on the computer unless the user exports or shares it separately.

## Contact

Privacy questions can be sent to [support.kanjiwidget@gmail.com](mailto:support.kanjiwidget@gmail.com).
