# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.9](https://github.com/encryption4all/cryptify/compare/v0.1.8...v0.1.9) - 2026-03-27

### Added

- one qr code for signature
- add button to include sender confirmation
- add sent confirmation, also encrypt for sender
- keep the border around the file box
- apply more of Jorrits new design
- add filesharing to multiple recipients
- more work on signatures
- update pg-wasm package
- change postguard pkg url
- add sender verification and update rocket to rc3
- include metrics header in all PKG requests
- retrieve lang setting via message
- add example irma server configuration
- determine backend url automatically
- bump wasm dependency to 0.2.2
- add swapped font
- minor style changes to match embedded design
- remove rocket cors for now, since backend and frontend are on the same host
- update docker-compose config
- feat add/update docker-compose configurations
- only expose nginx service from host
- frontend and backend on same origin

### Fixed

- semver version on release
- scope config.toml gitignore pattern to repo root only
- add initial v0.1.0 changelog entry to prevent release-plz from including all history
- trigger delivery on tag push so semver Docker tags are applied
- remove invalid command value from release-plz workflow
- replace checkmark SVG with HTML/unicode equivalent in email ([#29](https://github.com/encryption4all/cryptify/pull/29))
- replace SVG with PNG in email template ([#29](https://github.com/encryption4all/cryptify/pull/29))
- keep one recipient, clear when removed
- scrollable column
- use correct language in EncryptPanel
- translation and layout fixes
- start command in dev setup
- remove/rename irma/mailhog correctly
- wrong expiry date calculation
- height input file button in dutch
- minor changes to message textarea css
- actually use irma token in onEncrypt()
- sending e-mails now work in debug and release mode
- several front-end bugfixes
- typos
- backend config read correctly
- trailing slash backend url
- set public path correctly
- production-like config.toml
- error in dev config
- fix some post-merge errors
- fix conflicts
- force lowercase email address
- dont use form in DecryptPanel, since button in form uses has

### Other

- release v0.1.8
- Disable release-plz cargo publishing
- Add id-token write
- release v0.1.7
- Reset release-plz to defaults
- release v0.1.6
- release v0.1.5
- move Rust crate from cryptify/ subdirectory to repo root
- release v0.1.4
- Merge pull request #68 from encryption4all/fix/release-plz-setup
- release v0.1.1
- add package description to Cargo.toml
- update Rust edition from 2018 to 2021
- add repository and license metadata to Cargo.toml
- Merge pull request #58 from encryption4all/feat/release-plz
- Update pipeline action versions
- Add release-plz
- *(deps)* bump rustls-webpki from 0.103.8 to 0.103.10 in /cryptify
- Merge pull request #50 from encryption4all/dependabot/cargo/cryptify/time-0.3.47
- Merge pull request #49 from encryption4all/dependabot/cargo/cryptify/bytes-1.11.1
- *(deps)* bump bytes from 1.10.1 to 1.11.1 in /cryptify
- upgrade anchore/scan-action to v7.3.2 and codeql-action to v4
- Move imdage name from  cryptify-backend to cryptify
- Split Docker build into native amd64/arm64 jobs, add cargo-chef caching
- Add poll watching for claude code
- Change email template to match design
- Merge pull request #46 from encryption4all/rm-frontend
- Change url send confirmation
- Add SMTP logging and connection timeout to email sending
- Add 10s timeout to PKG fetch to prevent silent startup hang
- Change error to properly print url
- Add better error msg for pkg fetch
- Fix CI deployment
- Change email url
- Rename cryptify-backend to cryptify
- Add dockerignore to cut build context
- Change pkg_url in dev.toml
- Improve dev setup and update API description
- Remove frontend
- Remove frontend and clean up unused deployment files
- Add docker-compose.dev.yml for local development
- Update dev configuration for Rocket compatibility
- Add development Dockerfile for frontend
- Add development Dockerfile for backend with cargo-chef
- Remove double wasm types definition nginx.conf
- Use matrix builds for faster build times
- Use hashes instead of tags to prevent potential sidechain attacks
- External config file ([#31](https://github.com/encryption4all/cryptify/pull/31))
- Frontend docker file ([#30](https://github.com/encryption4all/cryptify/pull/30))
- Frontend docker file ([#29](https://github.com/encryption4all/cryptify/pull/29))
- Made a docker file for the frontend ([#28](https://github.com/encryption4all/cryptify/pull/28))
- I do not know how it got built with docker, now builds with command line too
- Added health endpoint ([#27](https://github.com/encryption4all/cryptify/pull/27))
- expose port
- Updated deps and made workflow for delivery ([#26](https://github.com/encryption4all/cryptify/pull/26))
- Update PKG URL
- Updated env var
- Update env variable
- Updated env vars
- Updated backend url to use main env
- Merge branch 'main' of https://github.com/encryption4all/cryptify
- Updated PKG URL
- Merge branch 'main' of https://github.com/encryption4all/cryptify
- Updated pg-wasm version
- Merge branch 'stable' into main
- *(deps)* update pg-wasm 0.3.0
- remove yivi css
- more work on layout
- change to sign and send button
- small changes
- merge main
- small changes
- use new pkg urls
- initial signature support
- remove unused encrypt panel code
- update to released version of lettre, minor other changes
- use PUBLIC_URL env variable
- small changes
- embed version of cryptify
- postguard embed version
- Merge branch 'dev'
- update readme
- add backend dockerfile
- update package-lock.json
- update docker-compose config
- update gitignore
- simplify decryptPanel
- small changes to compose
- remove old deployment files
- for now, don't include cors settings
- move dev config file to conf/
- remove unused old CORS config
- remove unused responders structs
- changes to verification code and setup CORS configuration
- simplify encryption process
- Merge main including sender authentication in dev branch
- Merge branch 'main' into add-email-verification
- Merge pull request #1 from arjentz/add-rust-backend
- Processed review
- Fix docker-compose.dev.yml
- Add development setup
- Remove metadata, cargo clippy, cargo fmt
- Update backend to match frontend changes
- Uncomment some proper checks
- Add code from rust backend
- Final sync to github
- Initial commit.
- Update README.md
- Update README.md
- Delete LICENSE
- Create LICENSE
- Initial commit

## [0.1.8](https://github.com/encryption4all/cryptify/compare/v0.1.7...v0.1.8) - 2026-03-27

### Fixed

- semver version on release

## [0.1.7](https://github.com/encryption4all/cryptify/compare/v0.1.6...v0.1.7) - 2026-03-27

### Other

- Reset release-plz to defaults

## [0.1.6](https://github.com/encryption4all/cryptify/compare/v0.1.5...v0.1.6) - 2026-03-27

### Added

- one qr code for signature
- add button to include sender confirmation
- add sent confirmation, also encrypt for sender
- keep the border around the file box
- apply more of Jorrits new design
- add filesharing to multiple recipients
- more work on signatures
- update pg-wasm package
- change postguard pkg url
- add sender verification and update rocket to rc3
- include metrics header in all PKG requests
- retrieve lang setting via message
- add example irma server configuration
- determine backend url automatically
- bump wasm dependency to 0.2.2
- add swapped font
- minor style changes to match embedded design
- remove rocket cors for now, since backend and frontend are on the same host
- update docker-compose config
- feat add/update docker-compose configurations
- only expose nginx service from host
- frontend and backend on same origin

### Fixed

- scope config.toml gitignore pattern to repo root only
- add initial v0.1.0 changelog entry to prevent release-plz from including all history
- trigger delivery on tag push so semver Docker tags are applied
- remove invalid command value from release-plz workflow
- replace checkmark SVG with HTML/unicode equivalent in email ([#29](https://github.com/encryption4all/cryptify/pull/29))
- replace SVG with PNG in email template ([#29](https://github.com/encryption4all/cryptify/pull/29))
- keep one recipient, clear when removed
- scrollable column
- use correct language in EncryptPanel
- translation and layout fixes
- start command in dev setup
- remove/rename irma/mailhog correctly
- wrong expiry date calculation
- height input file button in dutch
- minor changes to message textarea css
- actually use irma token in onEncrypt()
- sending e-mails now work in debug and release mode
- several front-end bugfixes
- typos
- backend config read correctly
- trailing slash backend url
- set public path correctly
- production-like config.toml
- error in dev config
- fix some post-merge errors
- fix conflicts
- force lowercase email address
- dont use form in DecryptPanel, since button in form uses has

### Other

- release v0.1.5
- move Rust crate from cryptify/ subdirectory to repo root
- release v0.1.4
- Merge pull request #68 from encryption4all/fix/release-plz-setup
- release v0.1.1
- add package description to Cargo.toml
- update Rust edition from 2018 to 2021
- add repository and license metadata to Cargo.toml
- Merge pull request #58 from encryption4all/feat/release-plz
- Update pipeline action versions
- Add release-plz
- *(deps)* bump rustls-webpki from 0.103.8 to 0.103.10 in /cryptify
- Merge pull request #50 from encryption4all/dependabot/cargo/cryptify/time-0.3.47
- Merge pull request #49 from encryption4all/dependabot/cargo/cryptify/bytes-1.11.1
- *(deps)* bump bytes from 1.10.1 to 1.11.1 in /cryptify
- upgrade anchore/scan-action to v7.3.2 and codeql-action to v4
- Move imdage name from  cryptify-backend to cryptify
- Split Docker build into native amd64/arm64 jobs, add cargo-chef caching
- Add poll watching for claude code
- Change email template to match design
- Merge pull request #46 from encryption4all/rm-frontend
- Change url send confirmation
- Add SMTP logging and connection timeout to email sending
- Add 10s timeout to PKG fetch to prevent silent startup hang
- Change error to properly print url
- Add better error msg for pkg fetch
- Fix CI deployment
- Change email url
- Rename cryptify-backend to cryptify
- Add dockerignore to cut build context
- Change pkg_url in dev.toml
- Improve dev setup and update API description
- Remove frontend
- Remove frontend and clean up unused deployment files
- Add docker-compose.dev.yml for local development
- Update dev configuration for Rocket compatibility
- Add development Dockerfile for frontend
- Add development Dockerfile for backend with cargo-chef
- Remove double wasm types definition nginx.conf
- Use matrix builds for faster build times
- Use hashes instead of tags to prevent potential sidechain attacks
- External config file ([#31](https://github.com/encryption4all/cryptify/pull/31))
- Frontend docker file ([#30](https://github.com/encryption4all/cryptify/pull/30))
- Frontend docker file ([#29](https://github.com/encryption4all/cryptify/pull/29))
- Made a docker file for the frontend ([#28](https://github.com/encryption4all/cryptify/pull/28))
- I do not know how it got built with docker, now builds with command line too
- Added health endpoint ([#27](https://github.com/encryption4all/cryptify/pull/27))
- expose port
- Updated deps and made workflow for delivery ([#26](https://github.com/encryption4all/cryptify/pull/26))
- Update PKG URL
- Updated env var
- Update env variable
- Updated env vars
- Updated backend url to use main env
- Merge branch 'main' of https://github.com/encryption4all/cryptify
- Updated PKG URL
- Merge branch 'main' of https://github.com/encryption4all/cryptify
- Updated pg-wasm version
- Merge branch 'stable' into main
- *(deps)* update pg-wasm 0.3.0
- remove yivi css
- more work on layout
- change to sign and send button
- small changes
- merge main
- small changes
- use new pkg urls
- initial signature support
- remove unused encrypt panel code
- update to released version of lettre, minor other changes
- use PUBLIC_URL env variable
- small changes
- embed version of cryptify
- postguard embed version
- Merge branch 'dev'
- update readme
- add backend dockerfile
- update package-lock.json
- update docker-compose config
- update gitignore
- simplify decryptPanel
- small changes to compose
- remove old deployment files
- for now, don't include cors settings
- move dev config file to conf/
- remove unused old CORS config
- remove unused responders structs
- changes to verification code and setup CORS configuration
- simplify encryption process
- Merge main including sender authentication in dev branch
- Merge branch 'main' into add-email-verification
- Merge pull request #1 from arjentz/add-rust-backend
- Processed review
- Fix docker-compose.dev.yml
- Add development setup
- Remove metadata, cargo clippy, cargo fmt
- Update backend to match frontend changes
- Uncomment some proper checks
- Add code from rust backend
- Final sync to github
- Initial commit.
- Update README.md
- Update README.md
- Delete LICENSE
- Create LICENSE
- Initial commit

## [0.1.5](https://github.com/encryption4all/cryptify/compare/v0.1.4...v0.1.5) - 2026-03-27

### Fixed

- add initial v0.1.0 changelog entry to prevent release-plz from including all history
- replace checkmark SVG with HTML/unicode equivalent in email ([#29](https://github.com/encryption4all/cryptify/pull/29))
- replace SVG with PNG in email template ([#29](https://github.com/encryption4all/cryptify/pull/29))

### Other

- release v0.1.4
- Merge pull request #68 from encryption4all/fix/release-plz-setup
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

## [0.1.4](https://github.com/encryption4all/cryptify/compare/v0.1.3...v0.1.4) - 2026-03-27

### Fixed

- add initial v0.1.0 changelog entry to prevent release-plz from including all history

### Other

- Merge pull request #68 from encryption4all/fix/release-plz-setup

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

## [0.1.0] - 2026-03-26

Initial release.
