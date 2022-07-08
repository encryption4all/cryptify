# cryptify

## Introduction

Cryptify offers file encryption/decryption based on IRMA attributes. It allows
you to encrypt any file with an attribute and only people with that attribute
can view the contents.

## Docker development setup

To run a development setup:

```
docker-compose -f docker-compose.dev.yml up
```

To run a production-like setup:

```
docker-compose up
```

## Frontend

### Development setup

-   Clone the project

        git clone git@github.com:privacybydesign/cryptify.git

-   Install nodejs 14 and rust

        # On Debian / Ubuntu
        curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

-   Goto the `cryptify-front-end` folder and install dependencies

        npm install

### Running the front-end

-   Change the `baseurl` constant in `FileProvider.ts` to `http://localhost:3000`.
    This way the front-end uses the locally running backend.

-   Start the development server

        npm run start

### Packaging webpage

-   Build the web site

        npm run build

### Packaging electron

-   Package electron installers

        npm run dist-electron

## Backend

### Configuration

For the back-end to be able to send e-mail and store files, the following environment variables are needed:

-   _ROCKET_CONFIG_: The path to the configuration file (example in `conf/`)

### Build

The backend can be built using:

```
env ROCKET_ENV={development,production} cargo build
```

The backend can be run using:

```
env ROCKET_CONFIG={path_to_config} ./target/{release,debug}/cryptify-backend
```

Get a development setup using:

```
env ROCKET_ENV=development ROCKET_CONFIG={path_to_config} cargo watch -x run
```
