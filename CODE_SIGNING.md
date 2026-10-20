# Code signing policy

KanjiWidget is applying for **free code signing provided by SignPath.io, certificate by SignPath Foundation**.

## Scope

Only release artifacts built from the public [KanjiWidget repository](https://github.com/platwa/KanjiWidget) and an identifiable Git tag may be submitted for signing. The signed files must correspond to source code available under the Apache License 2.0.

## Build and approval process

1. Windows artifacts are built from a tagged commit in GitHub Actions.
2. Automated tests, linting, and dependency checks run before packaging.
3. SignPath applies the CA-trusted Authenticode signature to the application and installer.
4. Release artifacts and SHA-256 checksums are retained together.
5. The project owner manually approves signing and publication.
6. Signed artifacts are published only through the official GitHub Releases page.

KanjiWidget does not include an automatic updater. Users check the installed version in the application and download new releases themselves.

## Team roles

- **Committer and reviewer:** [platwa](https://github.com/platwa)
- **Approver:** [platwa](https://github.com/platwa)

All maintainers with repository or signing access are required to use multi-factor authentication.

## Privacy

KanjiWidget does not include analytics, telemetry, advertising, background synchronization, or update checks. See the complete [privacy statement](PRIVACY.md).

## Reporting concerns

Security concerns should be reported according to [SECURITY.md](SECURITY.md). Signing access will be suspended if repository integrity, build provenance, or maintainer credentials are in doubt.
