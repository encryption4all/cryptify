# cryptify

## Introduction

Cryptify offers file encryption/decryption based on IRMA attributes. It allows you to encrypt any file
with an attribute and only people with that attribute can view the contents.

## Docker development setup

This section indicates how you can set-up the development environment to test sender verification, for this two Linux terminals are needed.
The first terminal is to start the docker daemon and the second terminal is to start the cryptify containers that run on the daemon. 
To access cryptify on localhost (or 127.0.0.1) and the mail server on 127.0.0.1:1080 enter the following commands:

Terminal 1:
```
sudo apt update
sudo apt-get install docker.io
sudo apt-get install docker-compose
sudo dockerd
```

Terminal 2:
```
sudo apt-get install nodejs
sudo apt-get install npm
sudo git clone https://github.com/mpmfrans/cryptify.git

cd cryptify
sudo mkdir irma 
cd irma
sudo wget https://github.com/privacybydesign/irmago/releases/download/v0.9.0/irma-master-linux-amd64
sudo chmod +x irma-master-linux-amd64
cd ..
cd cryptify-front-end
sudo npm install
cd ..
sudo docker-compose -f docker-compose.dev.yml up
```

To test sender verification, you'll need an Android device with the IRMA mobile application (https://play.google.com/store/apps/details?id=org.irmacard.cardemu) installed.
Connect your device to your computer via USB and enable USB debugging (https://developer.android.com/studio/debug/dev-options). 
Also, install the Android Debug Bridge (https://developer.android.com/studio/releases/platform-tools).

Enable developer mode on the IRMA mobile application by navigating to 'About IRMA' from the hamburger menu and tapping the version number until 'developer mode enabled'
appears at the bottom of the screen. This allows unsecure connections to an IRMA server so only use this for testing purposes. 

Finally, to enable the IRMA mobile application to find the server running on localhost check the presence of your android device(s) by running adb devices.
To be able to use Android Debug Bridge, unzip the platform-tools_r32.0.0-windows.zip, the files are in the platform-tools folder. Open Windows Powershell within
this folder. To check the presence of android device(s):

```
./adb devices
```

This should show your device as attached. If not, make sure USB debugging is enabled, and try unplugging and plugging the device.
To forward localhost traffic:

```
./adb reverse tcp:8088 tcp:8088
```

This should simply output 8088 to indicate success. If the IRMA mobile application gives error messages saying you need an internet
connection, run this command again. It can be unpredictable so don't be surprised if you need to run it more often. Now, you are able to scan the
QR-code with your android device and IRMA.

## Installation (short version)

Build the files using:
```
./deploy.sh
```

All needed source is now available in `./dist/{backend,frontend}`.

To quickly get a production-alike version, run:
```
docker-compose up
```

## Frontend

### Development setup

* Clone the project 

      git clone git@github.com:privacybydesign/cryptify.git

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
