# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (pnpm workspaces)
pnpm install

# Start all apps in development
pnpm dev                          # API: http://localhost:3001, Web: http://localhost:3000

# Build all apps
pnpm build

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Database
pnpm db:generate                  # Regenerate Prisma client after schema changes
pnpm db:push                      # Push schema to DB (no migration file)
pnpm db:migrate                   # Create and apply migration
pnpm db:studio                    # Open Prisma Studio

# Seed demo data (admin/judge/clerk users + sample case)
pnpm --filter @tpt-court/database run db:seed

# Run a specific app only
pnpm --filter @tpt-court/api dev
pnpm --filter @tpt-court/web dev

# Clean build artifacts
pnpm clean
```

Package manager is **pnpm 9**; do not use npm or yarn. Node >= 20 required.

## Architecture

Turborepo monorepo with three apps and three shared packages:

```
apps/
  api/       — Fastify 5 REST API + Socket.io (@tpt-court/api)
  web/       — Next.js 15 / React 19 frontend (@tpt-court/web)
  desktop/   — Electron wrapper around the web app (@tpt-court/desktop)
packages/
  database/  — Prisma schema + singleton client + seed (@tpt-court/database)
  types/     — Shared TypeScript types, no runtime deps (@tpt-court/types)
  ui/        — Shared Tailwind + React component library (@tpt-court/ui)
docker/      — docker-compose.yml, Dockerfile.api, Dockerfile.web
```

Build order is enforced by Turborepo: `packages/*` must build before `apps/*`.

### API (`apps/api`)

Entry: `src/index.ts` → `src/server.ts` (Fastify instance builder).

- All routes are registered as Fastify plugins with a prefix (e.g., `/api/cases`).
- Auth is handled by two middleware functions used as `preHandler` hooks:
  - `requireAuth` — verifies JWT, loads full user from DB, sets `request.user`
  - `requireRole(...roles)` — checks `request.user.role` against allowed roles
- The API uses **ESM** (`"type": "module"`) with `NodeNext` module resolution — all local imports must include `.js` extensions even when the source is `.ts`.
- `@fastify/jwt` signs tokens with `JWT_SECRET`; the session token is also stored in the `sessions` DB table for revocation.
- Socket.io is attached to the raw HTTP server in the `onReady` hook and decorates the Fastify instance as `app.io`. Route handlers emit events via `emitToUser(app.io, ...)` and `emitToCase(app.io, ...)` from `src/lib/socket.ts`.
- File uploads are saved to `UPLOADS_DIR` (default `./uploads`) and served as static files at `/uploads/`.
- Case numbers are auto-generated as `{COURT_CODE}-{YEAR}-{SEQ:05}` via `src/lib/caseNumber.ts`.
- All state-changing operations should call `recordAuditLog` from `src/lib/audit.ts`.

### Web (`apps/web`)

Next.js App Router layout:

- `(auth)` — unauthenticated routes: `/login`, `/register`
- `(dashboard)` — authenticated layout with sidebar/topbar; all court-staff routes
- `(public)` — public case search and case detail pages

Auth state lives in `src/lib/auth.tsx` (`AuthProvider` / `useAuth`). The JWT token is stored in `localStorage` and also set as a cookie; the Next.js middleware at `src/middleware.ts` reads the cookie to redirect unauthenticated requests server-side.

API calls go through the `api` client in `src/lib/api.ts` which reads `NEXT_PUBLIC_API_URL`. Socket.io connection is managed by `src/lib/socket.ts` (lazy singleton, call `connectSocket(token)` after login).

### Packages

- **`@tpt-court/types`** — the single source of truth for all shared types. Import from this package in both API and web rather than redefining types. Covers `AuthUser`, `JwtPayload`, domain items, API wrappers (`ApiSuccess<T>`, `PaginatedResponse<T>`), and `SocketEvents`.
- **`@tpt-court/database`** — exports the Prisma singleton (`import { prisma } from "@tpt-court/database"`). The schema lives at `packages/database/prisma/schema.prisma`. Run `pnpm db:generate` after any schema change.
- **`@tpt-court/ui`** — primitive components (Button, Card, Input, Badge, Table, StatusBadge variants). Uses `cn` utility from `src/lib/cn.ts` for conditional Tailwind classes.

## Key Conventions

- TypeScript is strict with `noUncheckedIndexedAccess` — always check array element access.
- Use `import type` for type-only imports (required by the tsconfig).
- Zod is used for all API request body validation in route handlers.
- Prisma is the only DB access layer; raw SQL queries are not used.
- Roles: `ADMIN > JUDGE, CLERK > LAWYER > PUBLIC`. The public portal (`/api/public/*` and web `(public)` routes) is unauthenticated.
- Payments use Stripe; the `stripePaymentIntentId` on `Payment` records is set after creating a PaymentIntent. Amounts are stored as integers (cents).

## Environment Setup

Copy `.env.example` files before first run:
```bash
cp apps/api/.env.example apps/api/.env   # Set DATABASE_URL and JWT_SECRET at minimum
cp apps/web/.env.example apps/web/.env
```

For Docker deployment, use `docker/.env.example` → `docker/.env` and run `docker compose up -d` from the `docker/` directory.
