#!/bin/bash

set -e

IMAGE_TAG='cryptify-build'
docker build . -t $IMAGE_TAG
docker create $IMAGE_TAG

CONTAINER_NAME=`docker ps -alq`;

rm -rf ./dist/* && mkdir -p ./dist

docker cp $CONTAINER_NAME:/app/cryptify-front-end/build/ ./dist/frontend
docker cp $CONTAINER_NAME:/app/cryptify-back-end/dist/ ./dist/backend
docker cp $CONTAINER_NAME:/app/cryptify-back-end/node_modules/ ./dist/backend

# server setup:
# install debian 10 + nginx and node 12
# create a cryptify user
# requests certificates and install cryptify.nl.conf as nginx configuration
# install backend unit service file in /lib/systemd/system/cryptify.service

rsync -rltP --delete dist/ cryptify@node.cryptify.nl:/home/cryptify/htdocs
