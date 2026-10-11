FROM alpine:3.19

# Install rclone for S3 sync and postgres-client for pg_dump
RUN apk add --no-cache \
    rclone \
    postgresql17-client \
    bash \
    curl \
    openssl \
    tzdata \
    dcron

# Copy scripts
COPY backup.sh /usr/local/bin/backup.sh
COPY restore.sh /usr/local/bin/restore.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh

WORKDIR /backup

# Run crond in foreground
CMD ["/usr/local/bin/backup.sh"]