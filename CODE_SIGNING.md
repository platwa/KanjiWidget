# Code signing policy

KanjiWidget is applying for **free code signing provided by SignPath.io, certificate by SignPath Foundation**.

## Scope

Only release artifacts built from the public [KanjiWidget repository](https://github.com/platwa/KanjiWidget) and an identifiable Git tag may be submitted for signing. The signed files must correspond to source code available under the Apache License 2.0.

## Build and approval process

1. Windows artifacts are built from a tagged commit in GitHub Actions.
2. Automated tests, linting, and dependency checks run before packaging.
3. SignPath applies the CA-trusted Authenticode signature to the application and installer.
4. The final Authenticode-signed updater installer is signed with KanjiWidget's separate Tauri updater key. This order is required because Authenticode signing changes the installer bytes.
5. Release artifacts, updater signatures, and SHA-256 checksums are retained together.
6. The project owner manually approves signing and publication.
7. Signed artifacts are published only through the official GitHub Releases page.

The updater public key is stored in the application configuration. Its private key is kept outside the repository and is provided to the release workflow only as a protected secret.

## Team roles

- **Committer and reviewer:** [platwa](https://github.com/platwa)
- **Approver:** [platwa](https://github.com/platwa)

All maintainers with repository or signing access are required to use multi-factor authentication.

## Privacy

KanjiWidget does not include analytics, telemetry, advertising, or background synchronization. It requests the public GitHub Releases update manifest at most once per day and asks before installing an available update. No decks, review history, or settings are included in the request. See the complete [privacy statement](PRIVACY.md).

## Reporting concerns

Security concerns should be reported according to [SECURITY.md](SECURITY.md). Signing access will be suspended if repository integrity, build provenance, or maintainer credentials are in doubt.
