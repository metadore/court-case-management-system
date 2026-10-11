# Contributing to TPT Court

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `pnpm install`
3. Set up PostgreSQL and copy `.env.example` files
4. Generate Prisma client: `pnpm db:generate`
5. Push schema: `pnpm db:push`
6. Seed data: `pnpm db:seed`
7. Start development: `pnpm dev`

## Project Structure

- `apps/api/` — Fastify backend
- `apps/web/` — Next.js frontend
- `apps/desktop/` — Electron wrapper
- `packages/database/` — Prisma schema and client
- `packages/types/` — Shared TypeScript definitions
- `packages/ui/` — Shared React components

## Code Style

- TypeScript strictly typed throughout
- Zod schemas for all API request validation
- Prisma for all database access
- Tailwind CSS for styling
- `import type` for type-only imports

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear commit messages
3. Ensure typecheck passes: `pnpm typecheck`
4. Update TODO.md if adding new features
5. Open a PR against `main`

## Commit Convention

We use conventional commits:
- `feat:` — New feature
- `fix:` — Bug fix
- `chore:` — Maintenance
- `docs:` — Documentation
- `refactor:` — Code refactoring
- `test:` — Adding tests