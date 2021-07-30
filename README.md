# cryptify

## Introduction

Cryptify offers file encryption/decryption based on IRMA attributes. It allows you to encrypt any file
with an attribute and only people with that attribute can view the contents.

## Installation (short version)

Build the files using:
```
./build.sh
```

All needed source is now available in `./dist/{backend,frontend}`.

To quickly get a production-alike version, run:
```
docker-compose up
```

## Frontend

### Development setup

* Clone the project 

      git clone git@gitlab.science.ru.nl:irma/cryptify.git

* Install nodejs 14 and rust

      # On Debian / Ubuntu
      curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
      curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

* Goto the `cryptify-front-end` folder and install dependencies

      npm install

### Running the front-end

* Change the `baseurl` constant in `FileProvider.ts` to `http://localhost:3000`.
  This way the front-end uses the locally running backend.

* Start the development server

      npm run start

### Packaging webpage

* Build the web site

      npm run build

### Packaging electron

* Package electron installers

      npm run dist-electron

## Backend

### Configuration

For the back-end to be able to send e-mail and store files, the following environment variables are needed:

* *EMAIL_SMTP_URL*: the URL of the server to be used as SMTP server, including e-mail, password and port.
* *EMAIL_FROM*: the address from which e-mail are to be sent.
* *STORAGE_DIR*: The directory where the files are going to be stored. 

### Build

The backend can be built using:
```
npm install
npm run build
```

### Installation

The only dependency of the backend is `nodemailer`. This can be installed using:
```
npm install --production
```

### Run
The backend can then be run using:

```
npm run start-dev
```
