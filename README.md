# <p align="center"><img src="./img/pg_logo.svg" height="128px" alt="PostGuard" /></p>

> For full documentation, visit [docs.postguard.eu](https://docs.postguard.eu/repos/cryptify).

File encryption and sharing service based on identity attributes. Cryptify is the file storage and delivery backend used by the PostGuard website and JavaScript SDK. When users upload encrypted files through PostGuard, they are stored and served by Cryptify.

The project has a Rust backend and a TypeScript frontend.

## Development

Docker is the recommended way to run the full stack:

```bash
docker-compose -f docker-compose.dev.yml up
```

For a production-like setup:

```bash
docker-compose up
```

To work on individual components without Docker, the frontend needs Node.js and the backend needs Rust. See the `cryptify-front-end` and `cryptify-back-end` directories for details.

## Releasing

Releases are automated with [release-plz](https://release-plz.ieni.dev/). Merging to `main` triggers a release, and Docker images are published automatically.

## License

MIT
