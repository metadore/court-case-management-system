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
- [x] AuditLog model + migration

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
- [x] `src/lib/audit.ts` helper

### Middleware

- [x] `src/middleware/requireAuth.ts` — JWT guard, attaches user to request
- [x] `src/middleware/requireRole.ts` — role-based access guard

### Routes

- [x] `src/routes/auth.ts` — POST /login, /register, /logout, /me
- [x] `src/routes/public.ts` — GET /cases (public search), GET /cases/:caseNumber (public detail)
- [x] `src/routes/cases.ts` instrument create/update + state changes
- [x] `src/routes/hearings.ts` instrument status changes
- [x] `src/routes/documents.ts` instrument upload + version/sign events
- [x] `src/routes/payments.ts` instrument payment status changes
- [x] `src/routes/notifications.ts` instrument read transitions
- [x] `src/routes/users.ts` instrument profile updates

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

---

## Phase 7 — Enhancements & Innovation

### Functional Gaps (Critical)
- [x] Fix document upload API to handle real multipart file uploads (filePath was empty)
- [x] Add document upload UI with file picker + modal form
- [x] Scheduling conflict detection — reject double-booking judges/courtrooms
- [x] Case state machine enforcement — restrict invalid status transitions
- [x] Audit log API endpoint `GET /api/cases/:id/audit-log`
- [x] Case timeline UI — vertical event history on case detail page
- [x] Hearing reminder notifications — pre-schedule reminders N days before hearing

### Quick Wins
- [x] iCal export endpoint `GET /api/cases/:caseId/hearings/:id/ical` (.ics download)
- [x] QR code on public case detail page (`GET /api/public/cases/:caseNumber/qr`)
- [x] Hearing calendar view (month grid, colour-coded by status) + sidebar link

### Major Features
- [x] TOTP-based 2FA — schema (`totpSecret`, `totpEnabled` on User), API endpoints, setup UI at `/settings/security`
- [x] AI case summarization — Claude API + local Ollama support (`GET /api/cases/:id/summary`, `AI_PROVIDER` env)

---

## Phase 8 — Industry Parity & Innovation

> Goal: rival the best paid court management platforms, not just open-source alternatives.

### Wave 1 — Standard Gaps (Table Stakes)

- [x] Case notes — internal scratchpad per case for judges/clerks/lawyers (`CaseNote` model, API, case detail "Notes" tab)
- [x] Courtroom management UI — `/admin/courtrooms` CRUD page (model already exists, no schema change)
- [x] Judge daily docket view — `/docket` page: today's hearings in order with case links and one-click print
- [x] CSV / Excel export — `GET /api/cases/export` and `GET /api/payments/export` endpoints + download buttons in UI
- [x] Statute of limitations warnings — banner on case detail when case is approaching or past SOL (uses `workflow.ts` jurisdiction config)
- [x] Service of process tracking UI — party list shows served/unserved status, "Mark Served" action, reminder badge for unserved parties past 30 days
- [x] Fee schedule auto-apply — when a case is created, auto-create a PENDING Payment record using the jurisdiction fee schedule from `workflow.ts`

### Wave 2 — Workflow Depth

- [x] Motion & deadline tracking — `Motion` model (type, status, filedAt, respondBy, replyBy), `Deadline` model, API routes, case detail "Motions" tab with deadline calendar
- [x] Court orders & judgment workflow — distinct ORDER/JUDGMENT document types, `Case.closeReason` enum (JUDGMENT | SETTLEMENT | DISMISSAL | DEFAULT | WITHDRAWN), enforce reason on CLOSE transition
- [x] Case lifecycle checklists — `CaseChecklistItem` model, configurable steps per case type (CRIMINAL: Arraignment → Bail → Preliminary → Trial), progress tracker on case detail
- [x] Appeals workflow — `Case.parentCaseId` self-relation for appeal-of links, appeal deadline tracking, "File Appeal" action on closed cases
- [x] Default judgment / no-show workflow — new case status paths (DEFAULT, DISMISSED_FOR_WANT_OF_PROSECUTION), hearing no-show recording action, `POST /cases/:id/hearings/:id/no-show`
- [x] Evidence chain of custody — `Evidence` model (title, type, custodian, intakeDate, storageLocation, condition) + `EvidenceTransfer` log, case detail "Evidence" tab
- [x] Interpreter management — flag cases needing interpreters from party data, admin interpreter assignment UI (`/admin/interpreters`)
- [x] Document templates library — 7 pre-made templates (Summons, Notice of Hearing, Order to Show Cause, Default Judgment, Dismissal, Motion for Continuance, Subpoena) with variable substitution + `POST /api/cases/:id/documents/from-template`
- [x] Document diff / version comparison — side-by-side view of two document versions (metadata + download links; GET /cases/:id/documents/:docId/versions)

### Wave 3 — Innovation & Differentiation

- [x] Court analytics dashboard — `/admin/analytics`: case aging, judge workload, case type distribution, resolution trends, alert badges
- [x] Smart deadline engine — when a MOTION document is filed, auto-create Deadline records per jurisdiction rules (opposition due N days, reply due M days)
- [x] Conflict of interest checker — on judge assignment, scan prior cases for shared parties; flag and require staff acknowledgment before assigning
- [x] Virtual hearing native integration — `Hearing.meetingLink` field, Jitsi Meet link auto-generated for VIRTUAL hearings, "Join Hearing" button in UI + link in iCal and notification emails
- [x] Public e-filing portal — pro se litigants file documents and initiate cases via public portal with Stripe payment (extends `/api/public` routes)
- [x] Fee waiver workflow — `FeeWaiverApplication` model, public application form (income + household size), staff review/approve/deny, auto-waive fees on approval
- [x] Clerk intake wizard — multi-step modal: case details → add parties → auto-apply fee → schedule first hearing — replaces current scattered flow
- [x] Drag-and-drop hearing rescheduling — calendar view allows dragging hearings to new slots; conflict detection runs on drop
- [x] Command palette (Cmd+K / Ctrl+K) — global quick-action search: find case, schedule hearing, upload document, navigate pages
- [x] Smart party autocomplete — when adding a party, typeahead searches existing users and parties to avoid duplicate data entry
- [x] Bulk operations — select multiple cases for bulk status update; select multiple hearings for bulk reschedule; bulk CSV export from filtered list

---

## Backlog (Phase 2+)

- [x] E-signature integration (self-signed PDF with HMAC-SHA256)
- [x] Email notifications (Nodemailer / Resend)
- [x] SMS notifications (Twilio)
- [x] Multi-court / multi-tenant mode (tenant routing by subdomain)
- [x] Audit log (every state change recorded)
- [x] Advanced search (PostgreSQL full-text with tsvector + GIN index)
- [x] Country-specific workflow plugins (fee schedules, form templates)
- [x] Report generation (PDF docket, case summary)
- [x] End-to-end tests (Playwright - test structure scaffolded)
- [x] Unit tests (Vitest - signature + workflow tests)
- [x] Speech-to-Text (STT) transcription — Whisper API + local, hearing recording upload via MediaRecorder, background transcription, transcript storage & viewing

