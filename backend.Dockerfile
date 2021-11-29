FROM debian:buster-slim
RUN apt-get update && \
  apt-get install -y libssl-dev && \
  rm -rf /var/lib/apt/lists/*

COPY ./dist/backend/server /app/backend
COPY ./conf/config.toml /app/config.toml

CMD ["/app/backend"]
