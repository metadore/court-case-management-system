# TPT Court — Deployment Guide

This document covers production deployment for all three targets:

- **VPS / Dedicated Server** — Docker Compose on a Linux VM with nginx, SSL, and production hardening
- **Desktop (Electron)** — Packaging and distributing the native desktop application for Windows and macOS
- **Manual / Bare-metal** — Running the API + Next.js directly on a server without Docker

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables Reference](#environment-variables-reference)
3. [Local Deployment (Development)](#local-deployment-development)
   - [Option A: Docker Compose](#option-a-docker-compose-easiest-all-services-included)
   - [Option B: Windows One-Click Setup](#option-b-windows-one-click-setup-no-docker-required)
   - [Option C: Manual Setup](#option-c-without-docker-manual-setup)
4. [Docker VPS Deployment](#docker-vps-deployment)
5. [Manual VPS Deployment](#manual-vps-deployment)
6. [S3-Compatible Object Storage](#s3-compatible-object-storage)
7. [Off-Site Backup Integration](#off-site-backup-integration)
8. [Desktop (Electron) Build & Distribution](#desktop-electron-build--distribution)
9. [Production Checklist](#production-checklist)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Component             | Version     | Notes                                    |
|-----------------------|-------------|------------------------------------------|
| Node.js               | >= 20       | LTS recommended                          |
| pnpm                  | >= 9        | `corepack enable && corepack prepare pnpm@9.15.0 --activate` |
| PostgreSQL            | 16          | Production should use a managed DB or replica |
| Redis                 | 7           | Optional — used for Socket.io scaling    |
| Docker & Compose      | Latest      | For containerized deployment             |
| nginx                 | >= 1.24     | Reverse proxy + SSL termination          |
| Certbot / acme.sh     | Latest      | Let's Encrypt SSL certificates           |

---

## Environment Variables Reference

### API (`apps/api/.env`)

| Variable               | Description                          | Required | Default                    |
|------------------------|--------------------------------------|----------|----------------------------|
| `PORT`                 | Server port                          | No       | `3001`                     |
| `HOST`                 | Bind address                         | No       | `0.0.0.0`                  |
| `NODE_ENV`             | Environment mode                     | No       | `development`              |
| `LOG_LEVEL`            | Pino log level                       | No       | `info`                     |
| `DATABASE_URL`         | PostgreSQL connection string         | **Yes**  | —                          |
| `JWT_SECRET`           | JWT signing secret (min 32 chars)    | **Yes**  | —                          |
| `CORS_ORIGIN`          | Comma-separated allowed origins      | No       | `http://localhost:3000`    |
| `STRIPE_SECRET_KEY`    | Stripe secret key                    | Optional | —                          |
| `STRIPE_WEBHOOK_SECRET`| Stripe webhook signing secret        | Optional | —                          |
| `UPLOADS_DIR`          | Document upload directory (local)    | No       | `./uploads`                |
| `STORAGE_ENDPOINT`     | S3-compatible endpoint               | Optional | — (uses local disk)        |
| `STORAGE_REGION`       | S3 region                            | Optional | `us-east-1`                |
| `STORAGE_BUCKET`       | S3 bucket name                       | Optional | `tpt-court-documents`      |
| `STORAGE_ACCESS_KEY`   | S3 access key                        | Optional | —                          |
| `STORAGE_SECRET_KEY`   | S3 secret key                        | Optional | —                          |
| `STORAGE_FORCE_PATH_STYLE`| Force path style addressing       | Optional | `false`                    |

### Web (`apps/web/.env`)

| Variable                              | Description                  | Required | Default                    |
|---------------------------------------|------------------------------|----------|----------------------------|
| `NEXT_PUBLIC_API_URL`                 | API base URL (with /api)     | **Yes**  | `http://localhost:3001/api`|
| `NEXT_PUBLIC_SOCKET_URL`              | Socket.io server URL         | **Yes**  | `http://localhost:3001`    |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`  | Stripe publishable key       | Optional | —                          |

### Docker / Backup (`docker/.env`)

| Variable                    | Description                              | Required | Default               |
|-----------------------------|------------------------------------------|----------|-----------------------|
| `BACKUP_ENABLED`            | Enable automated backups                 | No       | `false`               |
| `BACKUP_S3_ENDPOINT`        | S3-compatible endpoint for backups       | Optional | —                     |
| `BACKUP_S3_REGION`          | Backup S3 region                         | No       | `us-east-1`           |
| `BACKUP_S3_BUCKET`          | Backup S3 bucket name                    | Optional | —                     |
| `BACKUP_S3_ACCESS_KEY`      | Backup S3 access key                     | Optional | —                     |
| `BACKUP_S3_SECRET_KEY`      | Backup S3 secret key                     | Optional | —                     |
| `BACKUP_SCHEDULE`           | Cron schedule for backups                | No       | `0 3 * * *` (3am)     |
| `BACKUP_RETENTION_DAYS`     | Days to retain backups on S3             | No       | `30`                  |
| `BACKUP_ENCRYPTION_KEY`     | Encrypt backup files with AES-256        | Optional | —                     |

---

## Local Deployment (Development)

There are two ways to run the project locally:

### Option A: Docker Compose (easiest, all services included)

This starts PostgreSQL, Redis, MinIO, the API, and Next.js in containers — no manual database setup required.

```bash
# 1. Clone the repository
git clone <repo-url>
cd tpt-court

# 2. Copy the Docker environment file
cp docker/.env.example docker/.env

# 3. Start all services
cd docker
docker compose up -d

# 4. Run database migrations (wait ~10s for postgres to be ready first)
docker compose exec -T api npx prisma db push

# 5. (Optional) Seed demo data
docker compose exec -T api npx prisma db seed

# 6. Open in browser
#    Web: http://localhost:3000
#    API: http://localhost:3001/api
#    MinIO Console: http://localhost:9001 (minioadmin / minioadmin)
```

**What gets started:**
| Service | Port   | Purpose                        |
|---------|--------|--------------------------------|
| postgres| 5432   | Database                       |
| redis   | 6379   | Socket.io session store        |
| minio   | 9000   | S3-compatible file storage     |
| api     | 3001   | Fastify REST API               |
| web     | 3000   | Next.js frontend               |
| backup  | —      | Backup sidecar (idle by default) |

**Seed users** (created by `prisma db seed`):
| Email                     | Password     | Role  |
|---------------------------|--------------|-------|
| admin@tpt-court.test      | password123  | Admin |
| judge@tpt-court.test      | password123  | Judge |
| clerk@tpt-court.test      | password123  | Clerk |

To stop: `docker compose down`
To rebuild after code changes: `docker compose up -d --build`

### Option B: Windows One-Click Setup (no Docker required)

Double-click **`setup.bat`** in the project root. It will:

1. Auto-elevate to Administrator (required to configure PostgreSQL)
2. Install PostgreSQL via `winget` if not already present
3. Configure passwordless local authentication (`pg_hba.conf` → `trust`)
4. Create the `tpt_court` database
5. Copy `.env` files from their examples and patch `DATABASE_URL` and `JWT_SECRET` automatically
6. Run `pnpm install`, `db:generate`, `db:push`, and `db:seed`

After setup completes, start the app with:

```
pnpm dev
```

**Demo credentials** (seeded automatically):

| Email                       | Password    | Role   |
|-----------------------------|-------------|--------|
| admin@court.example         | Admin1234!  | Admin  |
| judge@court.example         | Judge1234!  | Judge  |
| clerk@court.example         | Clerk1234!  | Clerk  |
| lawyer@court.example        | Lawyer1234! | Lawyer |

> **Requirements:** Windows 10/11, Node.js 20+, pnpm 9.15+ (`npm install -g pnpm@9.15.0`).  
> PostgreSQL is installed automatically via `winget` if missing.

---

### Option C: Without Docker (manual setup)

Requires PostgreSQL 16 running locally (and optionally Redis 7).

```bash
# 1. Clone and install dependencies
git clone <repo-url>
cd tpt-court
pnpm install

# 2. Configure API environment
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env and set DATABASE_URL to your local PostgreSQL:
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tpt_court

# 3. Configure Web environment (defaults work out of the box)
cp apps/web/.env.example apps/web/.env

# 4. Create the database
createdb tpt_court
# Or via psql: CREATE DATABASE tpt_court;

# 5. Generate Prisma client, push schema, and seed
pnpm db:generate
pnpm db:push
pnpm db:seed

# 6. Start development servers (API + Web concurrently)
pnpm dev

# 7. Open in browser
#    Web: http://localhost:3000
#    API: http://localhost:3001/api
```

The API auto-reloads on file changes (Fastify with `--watch`).  
The Web is served by Next.js with HMR.

---

## Docker VPS Deployment

### 1. Provision a Linux Server

Requirements:
- Ubuntu 22.04 / Debian 12 (or any modern Linux distribution)
- Docker Engine 24+ and Docker Compose plugin
- A domain name pointing to the server's public IP (e.g., `court.yourcourt.org`)

### 2. Install Docker & Compose

```bash
# Install Docker Engine (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in to apply group changes

# Verify
docker --version
docker compose version
```

### 3. Clone the Repository

```bash
cd /opt
git clone https://github.com/your-org/tpt-court.git
cd tpt-court
```

### 4. Configure Environment

```bash
cp docker/.env.example docker/.env
```

Edit `docker/.env` with production values. The full reference is below — you can start with the essentials and add S3/backup later when needed.

### 5. Start Services

```bash
cd docker
docker compose up -d
```

This starts:
- `postgres` — PostgreSQL 16 database
- `redis` — Redis 7 for Socket.io
- `minio` — S3-compatible object storage for file uploads
- `minio-bucket-setup` — Creates the required bucket on MinIO
- `api` — Fastify backend
- `web` — Next.js frontend
- `backup` — Automated backup sidecar (idle until configured)

### 6. Run Database Migrations & Seed

```bash
# Push the Prisma schema to the database
docker compose exec -T api npx prisma db push

# Seed demo data (optional — skip for production)
docker compose exec -T api npx prisma db seed

# Verify
docker compose ps
```

### 7. Set Up nginx Reverse Proxy with SSL

Create `/etc/nginx/sites-available/tpt-court`:

```nginx
server {
    listen 80;
    server_name court.yourcourt.org;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name court.yourcourt.org;

    # SSL — replace with your certificate paths
    ssl_certificate     /etc/letsencrypt/live/court.yourcourt.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/court.yourcourt.org/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Web app (Next.js)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Socket.io — WebSocket support
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:3001;
    }
}
```

Enable the site and obtain SSL:

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/tpt-court /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Obtain Let's Encrypt SSL
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d court.yourcourt.org
```

### 8. Updating

```bash
cd /opt/tpt-court
git pull
cd docker
docker compose build --no-cache
docker compose up -d
# If the database schema changed:
docker compose exec -T api npx prisma db push
```

---

## Manual VPS Deployment

If you prefer running the services directly on the server without Docker:

### 1. Install Dependencies

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs postgresql redis nginx

# Enable pnpm
sudo corepack enable && sudo corepack prepare pnpm@9.15.0 --activate
```

### 2. Set Up PostgreSQL

```bash
sudo -u postgres psql -c "CREATE USER tpt_court WITH PASSWORD 'your_password';"
sudo -u postgres psql -c "CREATE DATABASE tpt_court OWNER tpt_court;"
```

### 3. Clone & Configure

```bash
git clone https://github.com/your-org/tpt-court.git /opt/tpt-court
cd /opt/tpt-court

# Install dependencies
pnpm install

# Copy env files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Edit `apps/api/.env` with your production values (see [Environment Variables Reference](#environment-variables-reference) for all options).

### 4. Build & Migrate

```bash
# Generate Prisma client & push schema
pnpm db:generate
pnpm db:push

# Build packages and apps
pnpm --filter @tpt-court/types build
pnpm --filter @tpt-court/database build
pnpm --filter @tpt-court/ui build
pnpm --filter @tpt-court/api build
pnpm --filter @tpt-court/web build
```

### 5. Run with Process Manager (pm2)

```bash
npm install -g pm2

# Start API
pm2 start apps/api/dist/index.js \
  --name tpt-court-api \
  --interpreter node \
  --env production

# Start Next.js
pm2 start apps/web/node_modules/.bin/next \
  --name tpt-court-web \
  -- start \
  -- -p 3000 \
  --cwd apps/web

# Save process list and set to start on boot
pm2 save
pm2 startup
```

### 6. Set Up nginx Reverse Proxy

Follow the same nginx configuration from [Section 7](#7-set-up-nginx-reverse-proxy-with-ssl) above.

---

## S3-Compatible Object Storage

The application supports three storage modes with **zero code changes** — just set environment variables:

| Mode | Configuration | Use Case |
|------|--------------|----------|
| **Local Disk** (default) | No `STORAGE_*` vars set | Development, single-server deployments |
| **S3-Compatible** | `STORAGE_ENDPOINT` + credentials set | Wasabi, Backblaze B2, AWS S3, Cloudflare R2 |
| **MinIO (Docker)** | `STORAGE_ENDPOINT=http://minio:9000` + `STORAGE_FORCE_PATH_STYLE=true` | Local S3 emulation in Docker |

### Quick Switch Examples

**Wasabi (production):**
```ini
STORAGE_ENDPOINT=https://s3.wasabisys.com
STORAGE_REGION=us-east-1
STORAGE_BUCKET=tpt-court-documents
STORAGE_ACCESS_KEY=your-wasabi-key
STORAGE_SECRET_KEY=your-wasabi-secret
STORAGE_FORCE_PATH_STYLE=false
```

**Backblaze B2:**
```ini
STORAGE_ENDPOINT=https://s3.us-east-005.backblazeb2.com
STORAGE_REGION=us-east-005
STORAGE_BUCKET=tpt-court-documents
STORAGE_ACCESS_KEY=your-b2-key
STORAGE_SECRET_KEY=your-b2-secret
STORAGE_FORCE_PATH_STYLE=false
```

**Local MinIO (Docker development):**
```ini
STORAGE_ENDPOINT=http://minio:9000
STORAGE_REGION=us-east-1
STORAGE_BUCKET=tpt-court-documents
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_FORCE_PATH_STYLE=true
```

**AWS S3:**
```ini
STORAGE_ENDPOINT=https://s3.us-east-1.amazonaws.com
STORAGE_REGION=us-east-1
STORAGE_BUCKET=tpt-court-documents
STORAGE_ACCESS_KEY=your-aws-key
STORAGE_SECRET_KEY=your-aws-secret
STORAGE_FORCE_PATH_STYLE=false
```

> **How it works:** When `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, and `STORAGE_SECRET_KEY` are all set, the API uploads/downloads documents via S3. If any of these are missing, it falls back to `UPLOADS_DIR` on the local filesystem. The MinIO Docker container in docker-compose automatically has its bucket created on startup.

### Creating the S3 Bucket

If using Wasabi, Backblaze, or AWS, create the bucket manually:

```bash
# Using AWS CLI (works for all S3-compatible providers)
aws s3 mb s3://tpt-court-documents --endpoint-url https://s3.wasabisys.com

# Or via the provider's web console
# Bucket name should match STORAGE_BUCKET env var
```

---

## Off-Site Backup Integration

A dedicated backup sidecar container runs alongside the main services and automatically creates encrypted PostgreSQL dumps, syncing them to any S3-compatible storage.

### Architecture

The `backup` service in docker-compose:
1. Connects to `postgres` and runs `pg_dump`
2. Optionally encrypts the dump with AES-256 (if `BACKUP_ENCRYPTION_KEY` is set)
3. Uploads to S3-compatible storage via `rclone`
4. Cleans up old backups based on `BACKUP_RETENTION_DAYS`
5. Runs on a cron schedule (`BACKUP_SCHEDULE`)

### Enabling Backups

Edit `docker/.env` and uncomment/configure:

```ini
BACKUP_ENABLED=true
BACKUP_S3_ENDPOINT=https://s3.wasabisys.com
BACKUP_S3_REGION=us-east-1
BACKUP_S3_BUCKET=tpt-court-backups
BACKUP_S3_ACCESS_KEY=your-wasabi-backup-key
BACKUP_S3_SECRET_KEY=your-wasabi-backup-secret
BACKUP_SCHEDULE=0 3 * * *
BACKUP_RETENTION_DAYS=30
BACKUP_ENCRYPTION_KEY=           # openssl rand -base64 32
```

Then restart the backup container:

```bash
cd docker
docker compose up -d backup
```

Check the logs to verify:

```bash
docker compose logs backup
```

### What Gets Backed Up

- **PostgreSQL database**: Full dump via `pg_dump --compress=9` (gzip)
- **Encryption**: When `BACKUP_ENCRYPTION_KEY` is set, the dump is encrypted with AES-256-CBC before upload
- **Retention**: Backups older than `BACKUP_RETENTION_DAYS` are automatically pruned

### Restoring from Backup

```bash
# List available backups
docker compose exec backup ls /backup/

# Restore the latest backup (interactive — confirms first)
docker compose exec backup restore.sh

# Restore a specific backup file
docker compose exec backup restore.sh tpt_court_20250101_030000.sql.gz
```

### Backup to Different Providers

**Wasabi:**
```ini
BACKUP_S3_ENDPOINT=https://s3.wasabisys.com
```

**Backblaze B2:**
```ini
BACKUP_S3_ENDPOINT=https://s3.us-east-005.backblazeb2.com
```

**AWS S3:**
```ini
BACKUP_S3_ENDPOINT=https://s3.us-east-1.amazonaws.com
```

### Manual Backup (One-off)

```bash
# Run a backup immediately (even if BACKUP_ENABLED=false)
docker compose exec -e BACKUP_ENABLED=true backup backup.sh

# Or run the backup script directly
docker compose exec backup /bin/sh -c "BACKUP_ENABLED=true /usr/local/bin/backup.sh"
```

---

## Desktop (Electron) Build & Distribution

The desktop app wraps the Next.js web app in an Electron shell. It can be packaged as a standalone installer for Windows (NSIS) and macOS (DMG).

### Prerequisites

- Windows: No extra tools needed (NSIS is bundled with electron-builder)
- macOS: Xcode Command Line Tools (`xcode-select --install`)
- All platforms: Node.js 20+, pnpm 9+

### 1. Development Mode

```bash
# From the monorepo root, start the API and Web dev servers first:
pnpm dev

# Then in another terminal, launch the Electron app in dev mode:
cd apps/desktop
NODE_ENV=development pnpm dev
```

The Electron window will connect to the Next.js dev server at `http://localhost:3000`.

### 2. Build for Distribution

```bash
cd apps/desktop

# Build the API and Web apps first (the Electron app expects them to be built)
pnpm --filter @tpt-court/types build
pnpm --filter @tpt-court/database build
pnpm --filter @tpt-court/ui build
pnpm --filter @tpt-court/api build
pnpm --filter @tpt-court/web build

# Package for the current platform
pnpm build

# Package for both Windows and macOS (requires both OS build agents)
pnpm dist
```

Output will be in `apps/desktop/release/`:
- Windows: `release/TPT Court Setup x.x.x.exe` (NSIS installer)
- macOS: `release/TPT Court-x.x.x.dmg` (DMG image)

### 3. Packaging Configuration

The build configuration is in `apps/desktop/electron-builder.config.json`:

```json
{
  "appId": "com.tpt-court.desktop",
  "productName": "TPT Court",
  "directories": {
    "output": "release"
  },
  "files": [
    "electron/**/*",
    "!node_modules/**/*"
  ],
  "win": {
    "target": "nsis"
  },
  "mac": {
    "target": "dmg"
  }
}
```

To customise:
- **App icon**: Place `build/icon.ico` (Windows) and `build/icon.icns` (macOS) in `apps/desktop/`
- **Code signing**: Set `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables for macOS notarisation
- **Auto-update**: Add `electron-updater` and configure `publish` in the config

### 4. Production Electron Architecture

In the production build, the Electron app is designed to connect to a **remote API server** — it does not bundle the API or database. The end user configures the API URL in the app's settings.

The built Electron app ships:
- The Next.js static assets are **not** bundled (the app loads from the remote URL)
- A thin Electron shell with preload script for OS integration
- The renderer loads `https://court.yourcourt.org` (or a configurable URL)

To update the default API URL for production builds, edit `apps/desktop/electron/main.ts`:

```typescript
// In production, load your deployed web app URL
const PRODUCTION_URL = "https://court.yourcourt.org";
mainWindow.loadURL(isDev ? "http://localhost:3000" : PRODUCTION_URL);
```

### 5. CI/CD for Desktop Builds

Example GitHub Actions workflow (`.github/workflows/desktop.yml`):

```yaml
name: Build Desktop App

on:
  push:
    tags:
      - "v*"

jobs:
  build:
    strategy:
      matrix:
        os: [windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - run: pnpm install

      - run: pnpm --filter @tpt-court/types build
      - run: pnpm --filter @tpt-court/database build
      - run: pnpm --filter @tpt-court/ui build
      - run: pnpm --filter @tpt-court/web build
      - run: pnpm --filter @tpt-court/api build

      - run: pnpm --filter @tpt-court/desktop build
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/upload-artifact@v4
        with:
          name: tpt-court-desktop-${{ matrix.os }}
          path: apps/desktop/release/*
```

---

## Production Checklist

### Security

- [ ] `JWT_SECRET` is a **strong, unique** value (generate with `openssl rand -base64 48`)
- [ ] All default passwords changed (PostgreSQL, MinIO, seed users)
- [ ] Database is **not** exposed publicly — only accessible from the API container
- [ ] CORS origin is set to your specific domain (not `*`)
- [ ] HTTPS enforced with valid SSL certificate (Let's Encrypt / paid)
- [ ] File upload size limits enforced (50 MB default in API)
- [ ] Rate limiting configured on nginx or API level
- [ ] Regular security updates applied to host OS and Docker images
- [ ] S3 bucket access keys restricted to minimal permissions
- [ ] Backup encryption key stored securely (e.g., Docker secrets or Vault)

### Performance

- [ ] Next.js static assets are cached with long `Cache-Control` headers via nginx
- [ ] PostgreSQL is tuned (shared_buffers, work_mem, etc.)
- [ ] Node.js memory limits set (e.g., `NODE_OPTIONS="--max-old-space-size=512"`)
- [ ] Consider CDN for serving uploaded files if using S3 storage

### Monitoring

- [ ] Health endpoint (`/health`) monitored with uptime checker
- [ ] Logs collected (Docker logs, or ship to central logging)
- [ ] Disk space monitored (uploads, database, logs)
- [ ] Backup success/failure alerting configured

### Backup

- [ ] Daily PostgreSQL dumps automated via backup sidecar
- [ ] Backups stored off-site (Wasabi, Backblaze, AWS S3)
- [ ] Backups encrypted at rest
- [ ] Restore procedure tested regularly
- [ ] Uploaded files included in backup strategy

---

## Troubleshooting

### Docker: Container exits immediately

Check logs:
```bash
docker compose logs api
docker compose logs web
```

Common causes:
- `DATABASE_URL` is wrong or database is not ready
- `JWT_SECRET` is empty
- Port 3000 or 3001 already in use

### nginx: 502 Bad Gateway

The upstream services are not running. Verify:
```bash
curl http://127.0.0.1:3001/health   # API
curl http://127.0.0.1:3000           # Web
```

### WebSocket not working

Ensure nginx is configured to forward WebSocket connections (see nginx config above). Also check that `NEXT_PUBLIC_SOCKET_URL` is set correctly.

### Desktop: App window is blank

- Check if the API and Web services are running and accessible
- Open DevTools in the Electron window (`Ctrl+Shift+I`) and check the console for network errors
- Verify the URL in `main.ts` is correct

### Database: Prisma push fails

```bash
# Check the connection from inside the container
docker compose exec api sh -c "ping postgres"
docker compose exec api sh -c "npx prisma db push --accept-data-loss"
```

### S3 Storage: Uploads failing

```bash
# Check the API logs for S3 errors
docker compose logs api

# Verify S3 connectivity from the API container
docker compose exec api sh -c "curl -I ${STORAGE_ENDPOINT}"

# Ensure the bucket exists and credentials are correct
```

### Backups: Not running

```bash
# Check backup logs
docker compose logs backup

# Verify env vars are set correctly
docker compose exec backup env | grep BACKUP

# Run a backup manually
docker compose exec -e BACKUP_ENABLED=true backup backup.sh
```

---

## Architecture Overview

```
                          ┌──────────────┐
                          │   Desktop     │ (Electron app)
                          │  (optional)   │
                          └──────┬───────┘
                                 │
┌─────────┐      ┌──────────────▼────────┐      ┌──────────┐      ┌──────────────┐
│ Browser │──────►                        │      │  Redis   │      │   Backup     │
└─────────┘      │   nginx (SSL/TLS)     │      │ (Socket) │      │   Sidecar    │
                  │   Reverse Proxy       │      └────┬─────┘      │  (rclone →   │
┌─────────┐      │   court.yourcourt.org │          │             │   S3/Wasabi)  │
│ Mobile  │──────►                        │         │             └──────────────┘
└─────────┘      └───────────┬────────────┘         │
                             │                      │
              ┌──────────────┼──────────────┐       │
              │              │              │       │
        ┌─────▼────┐  ┌─────▼────┐  ┌──────▼──┐   │
        │  Next.js │  │ Fastify  │  │ MinIO   │   │
        │  (Web)   │  │  (API)   │  │ (S3)    │   │
        └──────────┘  └─────┬────┘  └─────────┘   │
                            │                     │
                      ┌─────▼────┐               │
                      │PostgreSQL│◄───────────────┘
                      └──────────┘
```

### Data Flow

1. **Local storage (default):** Uploads → `UPLOADS_DIR` on disk → served by Fastify's `@fastify/static`
2. **S3 storage:** Uploads → S3-compatible API (Wasabi/Backblaze/MinIO/AWS) → served directly from S3 URLs
3. **Backups:** PostgreSQL dump → gzip + optional AES-256 encryption → rclone → S3 bucket
4. **Switching:** Change env vars and restart; the `storage.ts` service auto-detects which backend to use