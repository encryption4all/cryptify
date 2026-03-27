# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.3](https://github.com/encryption4all/cryptify/compare/v0.1.2...v0.1.3) - 2026-03-26

### Fixed

- replace checkmark SVG with HTML/unicode equivalent in email ([#29](https://github.com/encryption4all/cryptify/pull/29))
- replace SVG with PNG in email template ([#29](https://github.com/encryption4all/cryptify/pull/29))

### Other

- release v0.1.2
- release v0.1.1
- add package description to Cargo.toml
- update Rust edition from 2018 to 2021
- add repository and license metadata to Cargo.toml
- Split smtp credentials into username password
- *(deps)* bump rustls-webpki from 0.103.8 to 0.103.10 in /cryptify
- Merge pull request #50 from encryption4all/dependabot/cargo/cryptify/time-0.3.47
- Merge pull request #49 from encryption4all/dependabot/cargo/cryptify/bytes-1.11.1
- *(deps)* bump bytes from 1.10.1 to 1.11.1 in /cryptify
- Split Docker build into native amd64/arm64 jobs, add cargo-chef caching
- Change email template to match design
- Change url send confirmation
- Add SMTP logging and connection timeout to email sending
- Add 10s timeout to PKG fetch to prevent silent startup hang
- Change error to properly print url
- Add better error msg for pkg fetch
- Change email url
- Rename cryptify-backend to cryptify

## [0.1.2](https://github.com/encryption4all/cryptify/compare/v0.1.1...v0.1.2) - 2026-03-26

### Other

- update Cargo.toml dependencies

## [0.1.1](https://github.com/encryption4all/cryptify/compare/v0.1.0...v0.1.1) - 2026-03-26

### Other

- add package description to Cargo.toml
- update Rust edition from 2018 to 2021
