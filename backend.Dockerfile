FROM rust:1.91.0-slim-trixie AS builder

ENV ROCKET_PROFILE=release

WORKDIR /app

COPY cryptify-back-end/src ./src
COPY cryptify-back-end/templates ./templates
COPY cryptify-back-end/Cargo.toml .
COPY cryptify-back-end/Cargo.lock .

RUN apt-get update  \
    && apt-get --no-install-recommends install -y libssl-dev pkg-config  \
    && rm -rf /var/lib/apt/lists/*  \
    && cargo build --release  \
    && cp ./target/release/cryptify-backend /usr/local/bin/cryptify-backend


FROM debian:trixie-slim
ENV ROCKET_CONFIG=config.toml

RUN groupadd -r nonroot \
    && useradd -r -g nonroot nonroot \
    && apt-get update  \
    && apt-get --no-install-recommends install -y ca-certificates libssl3  \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/bin/cryptify-backend /usr/local/bin/cryptify-backend
RUN mkdir -p /app && chown nonroot:nonroot /app

WORKDIR /app
USER nonroot

RUN mkdir -p /tmp/data

CMD ["/bin/sh", "-c", "/usr/local/bin/cryptify-backend"]
