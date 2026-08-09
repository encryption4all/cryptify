# <p align="center"><img src="./img/pg_logo.svg" height="128px" alt="PostGuard" /></p>

> For full documentation, visit [docs.postguard.eu](https://docs.postguard.eu/repos/cryptify).

> [!IMPORTANT]
> **This repository is archived. Development moved to [encryption4all/postguard](https://github.com/encryption4all/postguard), under `cryptify/`.**
> That repository builds the crate as a workspace member sharing a single lockfile with `pg-core`/`pg-pkg`, and its `delivery.yml` is now the sole publisher of `ghcr.io/encryption4all/cryptify` — the image name is unchanged, so nothing deployed has to be repointed. The open issues moved there too.
> This repository is kept read-only for history. It no longer builds, publishes, or releases anything.

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

Nothing is released from this repository any more. `cryptify` is versioned by
[encryption4all/postguard](https://github.com/encryption4all/postguard)'s workspace
`release-plz` (tags `cryptify-v*`), and its images are published by that repository's
`delivery.yml`. The last release cut here was `v0.1.27`; `cryptify-v0.1.28` onward
carry the workspace tag shape.

## License

MIT
