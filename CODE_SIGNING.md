# Code signing policy

KanjiWidget is applying for **free code signing provided by SignPath.io, certificate by SignPath Foundation**.

## Scope

Only release artifacts built from the public [KanjiWidget repository](https://github.com/platwa/KanjiWidget) and an identifiable Git tag may be submitted for signing. The signed files must correspond to source code available under the Apache License 2.0.

## Build and approval process

1. Windows artifacts are built from a tagged commit in GitHub Actions.
2. Automated tests, linting, and dependency checks run before packaging.
3. Release artifacts and SHA-256 checksums are retained together.
4. The project owner manually approves signing and publication.
5. Signed artifacts are published only through the official GitHub Releases page.

## Team roles

- **Committer and reviewer:** [platwa](https://github.com/platwa)
- **Approver:** [platwa](https://github.com/platwa)

All maintainers with repository or signing access are required to use multi-factor authentication.

## Privacy

KanjiWidget does not include analytics, telemetry, advertising, or background synchronization. This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it. See the complete [privacy statement](PRIVACY.md).

## Reporting concerns

Security concerns should be reported according to [SECURITY.md](SECURITY.md). Signing access will be suspended if repository integrity, build provenance, or maintainer credentials are in doubt.
