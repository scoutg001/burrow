# Stage 1: daemon
FROM rust:1-slim AS daemon
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY fixtures ./fixtures
RUN cargo build --release

# Stage 2: web assets
FROM node:20-slim AS web
WORKDIR /build
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web ./
RUN npm run build

# Final: slim runtime with CA certs (the daemon may reach an HTTPS API)
FROM debian:stable-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=daemon /build/target/release/burrow /usr/local/bin/burrow
COPY --from=web /build/index.html /build/style.css /srv/web/
COPY --from=web /build/js /srv/web/js
COPY --from=web /build/vendor /srv/web/vendor
ENV BURROW_WEBROOT=/srv/web
EXPOSE 2700
CMD ["burrow"]
