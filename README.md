# <p align="center"><img src="./img/pg_logo.svg" height="128px" alt="PostGuard" /></p>

> For full documentation, visit [docs.postguard.eu](https://docs.postguard.eu/repos/cryptify).

> [!IMPORTANT]
> **Development moved to [encryption4all/postguard](https://github.com/encryption4all/postguard), under `cryptify/`.**
> That repository builds the crate as a workspace member sharing a single lockfile with `pg-core`/`pg-pkg`. Open issues have moved there too.
> This repository is kept for history and will be archived once its Docker publish pipeline cuts over to `postguard`. Until then, this repository's CI is still the only publisher of `ghcr.io/encryption4all/cryptify` — do not remove its build/push steps yet.

File encryption and sharing service based on identity attributes. Cryptify is the file storage and delivery backend used by the PostGuard website and JavaScript SDK. When users upload encrypted files through PostGuard, they are stored and served by Cryptify.

Cryptify is a Rust service built on the Rocket framework.

## Development

Docker is the recommended way to run the service:

```bash
docker-compose -f docker-compose.dev.yml up
```

For a production-like setup:

```bash
docker-compose up
```

To work on the service without Docker, Rust is required:

```bash
env ROCKET_CONFIG=conf/config.dev.toml cargo run
```

## Releasing

Releases are automated with [release-plz](https://release-plz.ieni.dev/). Merging to `main` triggers a release, and Docker images are published automatically.

## License

MIT
