FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=8080 \
    CLAMD_HOST=127.0.0.1 \
    CLAMD_PORT=3310

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends clamav clamav-daemon ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY scanner /app/scanner
RUN chmod 0755 /app/scanner/start.sh \
    && mkdir -p /var/lib/clamav \
    && chown -R clamav:clamav /var/lib/clamav

USER root
EXPOSE 8080
ENTRYPOINT ["/app/scanner/start.sh"]
