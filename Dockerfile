FROM node:12-buster

ENV RUST_VERSION 1.52

ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs > /usr/local/bin/rustup-init; \
    chmod +x /usr/local/bin/rustup-init; \
    rustup-init -y --no-modify-path --default-toolchain "${RUST_VERSION}"; \
    chmod -R a+rw ${RUSTUP_HOME} ${CARGO_HOME}; \
    rm /usr/local/bin/rustup-init; \
    rustup --version; \
    cargo --version; \
    rustc --version;

COPY ./cryptify-front-end /app/cryptify-front-end

RUN cd /app/cryptify-front-end; \
    npm install; \
    npm run build;

COPY ./cryptify-back-end /app/cryptify-back-end

RUN cd /app/cryptify-back-end; \
    cargo install --path . --root .;
