#!/bin/bash

set -e

IMAGE_TAG='cryptify-build'
docker build . -t $IMAGE_TAG
docker create $IMAGE_TAG

CONTAINER_NAME=`docker ps -alq`;

rm -rf ./dist/* && mkdir -p ./dist

docker cp $CONTAINER_NAME:/app/cryptify-front-end/build/ ./dist/frontend

mkdir -p ./dist/backend
docker cp $CONTAINER_NAME:/app/cryptify-back-end/bin/cryptify-backend ./dist/backend/server


# server setup:
# install debian 10 + nginx and node 12
# create a cryptify user
# requests certificates and install cryptify.nl.conf as nginx configuration
# install backend unit service file in /lib/systemd/system/cryptify.service

### uncomment the following line to actually deploy:
# rsync -rltP --delete dist/ cryptify@node.cryptify.nl:/home/cryptify/htdocs
