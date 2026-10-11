# TPT Court

Open-source court ERP platform for judges, lawyers, clerks, and the public. Manage cases, documents, hearings, and payments with ease.

## Architecture

```
tpt-court/
├── apps/
│   ├── api/          # Fastify REST API + Socket.io
│   ├── web/          # Next.js 15 web application
│   └── desktop/      # Electron desktop wrapper
├── packages/
│   ├── database/     # Prisma ORM, schema, seed
│   ├── types/        # Shared TypeScript types
│   └── ui/           # Shared UI components (React + Tailwind)
├── docker/           # Docker Compose + Dockerfiles
└── turbo.json        # Turborepo configuration
```

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- PostgreSQL 16
- Redis 7 (optional, for Socket.io)

### Setup

```bash
# Clone and install
git clone <repo-url>
cd tpt-court
pnpm install

# Setup database
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your DATABASE_URL
pnpm db:generate
pnpm db:push
pnpm db:seed

# Start development
pnpm dev

# API: http://localhost:3001
# Web: http://localhost:3000
```

### Seed Data

The seed script creates:

- A demo court (Central District Court, code: MAIN)
- Admin user: admin@court.example / Admin1234!
- Judge user: judge@court.example / Judge1234!
- Clerk user: clerk@court.example / Clerk1234!
- Lawyer user: lawyer@court.example / Lawyer1234!
- Sample case with parties and hearing

## Environment Variables

### API (`apps/api/.env`)

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `3001` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | JWT signing secret | Required |
| `CORS_ORIGIN` | Allowed CORS origins | `http://localhost:3000` |
| `STRIPE_SECRET_KEY` | Stripe secret key | Optional |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | Optional |
| `UPLOADS_DIR` | File upload directory | `./uploads` |

### Web (`apps/web/.env`)

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | API base URL | `http://localhost:3001/api` |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.io URL | `http://localhost:3001` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | Optional |

## API Routes

### Auth
- `POST /api/auth/register` — Register new user
- `POST /api/auth/login` — Login
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Current user

### Public
- `GET /api/public/cases` — Search public cases
- `GET /api/public/cases/:caseNumber` — Public case detail

### Cases (authenticated)
- `GET /api/cases` — List cases
- `POST /api/cases` — Create case (Clerk/Admin/Judge)
- `GET /api/cases/:id` — Case detail
- `PUT /api/cases/:id` — Update case
- `DELETE /api/cases/:id` — Delete case (Admin)
- `POST /api/cases/:id/parties` — Add party
- `DELETE /api/cases/:id/parties/:partyId` — Remove party

### Documents (authenticated)
- `GET /api/documents/list/:caseId` — List documents
- `POST /api/documents/upload` — Upload document
- `GET /api/documents/download/:id` — Download document

### Hearings (authenticated)
- `GET /api/hearings` — Calendar view (Judge/Clerk/Admin)
- `GET /api/hearings/case/:caseId` — Case hearings
- `POST /api/hearings` — Create hearing
- `PUT /api/hearings/:id` — Update hearing
- `DELETE /api/hearings/:id` — Delete hearing

### Notifications (authenticated)
- `GET /api/notifications` — List notifications
- `PATCH /api/notifications/:id/read` — Mark read
- `PATCH /api/notifications/read-all` — Mark all read

### Payments (authenticated)
- `GET /api/payments` — List payments
- `POST /api/payments/create-intent` — Create Stripe PaymentIntent
- `POST /api/payments/webhook` — Stripe webhook

### Users (authenticated)
- `GET /api/users` — List users (Admin)
- `GET /api/users/me` — Profile
- `PUT /api/users/me` — Update profile
- `GET /api/users/:id` — User detail (Admin)
- `PUT /api/users/:id` — Admin update user

## Docker Deployment

```bash
# Copy environment
cp docker/.env.example docker/.env
# Edit docker/.env

# Start services
cd docker
docker compose up -d

# Run migrations
docker compose exec api npx prisma db push
docker compose exec api npx prisma db seed
```

## Tech Stack

- **Backend**: Fastify, Prisma, Socket.io, Stripe, Zod
- **Frontend**: Next.js 15, React 19, Tailwind CSS, Socket.io Client
- **Database**: PostgreSQL
- **Desktop**: Electron
- **Monorepo**: Turborepo, pnpm workspaces

## License

MIT