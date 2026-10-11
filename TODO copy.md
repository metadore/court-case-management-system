# TPT Court — Build Tracker

## Legend
- [x] Done
- [ ] To do
- [~] In progress

---

## Phase 1 — Monorepo Foundation

- [x] Root `package.json` (pnpm workspaces)
- [x] `turbo.json`
- [x] `tsconfig.base.json`
- [x] `.gitignore`
- [x] `.npmrc`
- [x] `LICENSE` (MIT)

---

## Phase 2 — packages/database

- [x] `package.json`
- [x] `tsconfig.json`
- [x] `prisma/schema.prisma` — full schema (Court, User, Session, Case, Party, Document, Courtroom, Hearing, Notification, Payment)
- [x] `src/index.ts` — Prisma singleton client
- [x] `src/seed.ts` — demo court, users, case, hearing

---

## Phase 3 — packages/types

- [x] `package.json`
- [x] `tsconfig.json`
- [x] `src/index.ts` — all shared TS types (Auth, Cases, Documents, Hearings, Payments, Notifications, Socket events, API wrappers)

---

## Phase 4 — packages/ui

- [x] `package.json` + `tsconfig.json`
- [x] `src/lib/cn.ts` — Tailwind class merge utility
- [x] `src/components/button.tsx`
- [x] `src/components/badge.tsx`
- [x] `src/components/card.tsx`
- [x] `src/components/input.tsx`
- [x] `src/components/label.tsx`
- [x] `src/components/select.tsx`
- [x] `src/components/status-badge.tsx` — CaseStatusBadge, HearingStatusBadge, PaymentStatusBadge
- [x] `src/components/table.tsx`
- [x] `src/index.ts`

---

## Phase 5 — apps/api (Fastify)

### Setup
- [x] `package.json`
- [x] `tsconfig.json`
- [x] `src/index.ts` — server entry point
- [x] `src/server.ts` — Fastify instance, plugins, route registration, Socket.io setup

### Lib / Utilities
- [x] `src/lib/prisma.ts`
- [x] `src/lib/stripe.ts`
- [x] `src/lib/socket.ts` — Socket.io handlers + emit helpers
- [x] `src/lib/storage.ts` — file upload / save
- [x] `src/lib/caseNumber.ts` — auto case number generation

### Middleware
- [x] `src/middleware/requireAuth.ts` — JWT guard, attaches user to request
- [x] `src/middleware/requireRole.ts` — role-based access guard

### Routes
- [x] `src/routes/auth.ts` — POST /login, /register, /logout, /me
- [x] `src/routes/public.ts` — GET /cases (public search), GET /cases/:caseNumber (public detail)
- [x] `src/routes/cases.ts` — full CRUD, party management
- [x] `src/routes/documents.ts` — upload, list, download, version
- [x] `src/routes/hearings.ts` — CRUD, calendar view
- [x] `src/routes/notifications.ts` — list, mark read, mark all read
- [x] `src/routes/payments.ts` — Stripe payment intent, webhook, list
- [x] `src/routes/users.ts` — list users, update profile, admin user management

### Config
- [x] `.env.example`

---

## Phase 6 — apps/web (Next.js 15)

### Setup
- [x] `package.json`
- [x] `tsconfig.json`
- [x] `next.config.ts`
- [x] `tailwind.config.ts`
- [x] `postcss.config.js`

### App Shell
- [x] `src/app/layout.tsx` — root layout, font, metadata
- [x] `src/app/globals.css`
- [x] `src/middleware.ts` — Next.js auth guard (redirect unauthenticated)

### Lib
- [x] `src/lib/api.ts` — typed fetch client for the API
- [x] `src/lib/auth.tsx` — AuthContext, useAuth hook
- [x] `src/lib/socket.ts` — Socket.io client singleton
- [x] `src/lib/utils.ts` — date formatting, currency, case number helpers

### Public Pages (unauthenticated)
- [x] `src/app/(public)/page.tsx` — landing / home
- [x] `src/app/(public)/search/page.tsx` — public case search
- [x] `src/app/(public)/cases/[caseNumber]/page.tsx` — public case detail + documents + hearings

### Auth Pages
- [x] `src/app/(auth)/login/page.tsx`
- [x] `src/app/(auth)/register/page.tsx`

### Dashboard (authenticated)
- [x] `src/app/(dashboard)/layout.tsx` — sidebar, topbar, notification bell
- [x] `src/app/(dashboard)/dashboard/page.tsx` — role-aware home (stats, upcoming hearings, recent activity)
- [x] `src/app/(dashboard)/cases/page.tsx` — case list with filters + search
- [x] `src/app/(dashboard)/cases/new/page.tsx` — file new case (Clerk/Admin only)
- [x] `src/app/(dashboard)/cases/[id]/page.tsx` — case detail
- [x] `src/app/(dashboard)/cases/[id]/documents/page.tsx` — document list + upload
- [x] `src/app/(dashboard)/cases/[id]/hearings/page.tsx` — hearing list + schedule
- [x] `src/app/(dashboard)/hearings/page.tsx` — calendar view (Judge, Clerk)
- [x] `src/app/(dashboard)/notifications/page.tsx` — notification inbox
- [x] `src/app/(dashboard)/admin/page.tsx` — user management (Admin only)

### Components
- [x] `src/components/layout/sidebar.tsx`
- [x] `src/components/layout/topbar.tsx`
- [x] `src/components/layout/notification-bell.tsx`
- [ ] `src/components/cases/case-table.tsx`
- [ ] `src/components/cases/case-form.tsx`
- [ ] `src/components/cases/party-list.tsx`
- [ ] `src/components/hearings/hearing-calendar.tsx`
- [ ] `src/components/hearings/hearing-form.tsx`
- [ ] `src/components/documents/document-list.tsx`
- [ ] `src/components/documents/upload-zone.tsx`
- [ ] `src/components/payments/payment-form.tsx` — Stripe Elements

---

## Phase 7 — apps/desktop (Electron)

- [x] `package.json`
- [x] `tsconfig.json`
- [x] `electron/main.js` — BrowserWindow, app lifecycle, local server launch
- [x] `electron/preload.js` — contextBridge APIs
- [ ] `electron-builder.config.json` — Windows/Mac packaging

---

## Phase 8 — Docker / Deployment

- [x] `docker/docker-compose.yml` — app + postgres + redis + minio
- [x] `docker/Dockerfile.api`
- [x] `docker/Dockerfile.web`
- [x] `docker/.env.example`

---

## Phase 9 — Docs & DX

- [x] `README.md` — quickstart, architecture diagram, env vars, deployment guide
- [x] `CONTRIBUTING.md`
- [x] `apps/api/.env.example`
- [x] `apps/web/.env.example`
- [ ] `apps/desktop/.env.example`

---

## Backlog (Phase 2+)

- [ ] E-signature integration (DocuSign / self-signed PDF)
- [ ] Email notifications (Nodemailer / Resend)
- [ ] SMS notifications (Twilio)
- [ ] Multi-court / multi-tenant mode (tenant routing by subdomain)
- [ ] Audit log (every state change recorded)
- [ ] Advanced search (OpenSearch / PostgreSQL full-text)
- [ ] Country-specific workflow plugins (fee schedules, form templates)
- [ ] Report generation (PDF docket, case summary)
- [ ] Mobile app (React Native sharing API + types packages)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] End-to-end tests (Playwright)
- [ ] Unit tests (Vitest)