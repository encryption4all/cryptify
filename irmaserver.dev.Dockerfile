FROM debian:stable

RUN apt-get update && apt-get install curl -y && apt-get clean

COPY ./irma/irma-master-linux-amd64 /app/irma
RUN chmod +x /app/irma

WORKDIR /app

