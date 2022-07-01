FROM debian:buster-slim
RUN apt-get update && \
  apt-get install -y libssl-dev && \
  rm -rf /var/lib/apt/lists/*
