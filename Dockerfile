FROM rust:1.93.0-slim-trixie AS builder

ENV ROCKET_PROFILE=release

WORKDIR /app

COPY cryptify/src ./src
COPY cryptify/templates ./templates
COPY cryptify/Cargo.toml .
COPY cryptify/Cargo.lock .

RUN apt-get update  \
    && apt-get --no-install-recommends install -y libssl-dev pkg-config  \
    && rm -rf /var/lib/apt/lists/*  \
    && cargo build --release  \
    && cp ./target/release/cryptify /usr/local/bin/cryptify


FROM debian:trixie-slim
ENV ROCKET_CONFIG=config.toml

RUN groupadd -r nonroot \
    && useradd -r -g nonroot nonroot \
    && apt-get update  \
    && apt-get --no-install-recommends install -y ca-certificates libssl3  \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/bin/cryptify /usr/local/bin/cryptify
RUN mkdir -p /app && chown nonroot:nonroot /app

WORKDIR /app
USER nonroot

RUN mkdir -p /tmp/data

EXPOSE 8000

CMD ["/bin/sh", "-c", "/usr/local/bin/cryptify"]
