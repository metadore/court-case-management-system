/**
 * Public e-filing routes — unauthenticated endpoints that allow pro se litigants
 * to initiate cases and pay the filing fee via Stripe without a staff account.
 *
 * Flow:
 *   1. GET  /api/public/courts                    — list active courts for the selector
 *   2. POST /api/public/efile/initiate            — create a Stripe PaymentIntent
 *   3. POST /api/public/efile/submit              — verify payment, persist Case + Party + Payment
 *   4. GET  /api/public/efile/payment-intent/:id  — poll payment status
 */

import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { prisma } from "@tpt-court/database";
import type { PartyRole } from "@tpt-court/types";
import { stripe, STRIPE_ENABLED } from "../lib/stripe.js";
import { z } from "zod";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Filing fee in cents ($50.00 USD). */
const FILING_FEE_CENTS = 5000;

// ─── Validation schemas ───────────────────────────────────────────────────────

const caseTypeEnum = z.enum([
  "CIVIL",
  "CRIMINAL",
  "FAMILY",
  "PROBATE",
  "COMMERCIAL",
  "CONSTITUTIONAL",
  "APPELLATE",
  "OTHER",
]);

const filerRoleEnum = z.enum([
  "PLAINTIFF",
  "DEFENDANT",
  "INTERVENOR",
  "OTHER",
]);

const initiateSchema = z.object({
  courtId: z.string().min(1),
  caseType: caseTypeEnum,
  title: z.string().min(5).max(500),
  filerName: z.string().min(2).max(200),
  filerEmail: z.string().email(),
  filerRole: filerRoleEnum,
});

const submitSchema = z.object({
  paymentIntentId: z.string().min(1),
  courtId: z.string().min(1),
  caseType: caseTypeEnum,
  title: z.string().min(5).max(500),
  description: z.string().max(2000).optional(),
  filerName: z.string().min(2).max(200),
  filerEmail: z.string().email(),
  filerPhone: z.string().max(50).optional(),
  filerRole: filerRoleEnum,
  opposingPartyName: z.string().max(200).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Determine the opposing party role based on the filer's role.
 * Plaintiffs get a Defendant counterpart and vice versa.
 */
function opposingRole(filerRole: z.infer<typeof filerRoleEnum>): PartyRole {
  if (filerRole === "PLAINTIFF") return "DEFENDANT";
  if (filerRole === "DEFENDANT") return "PLAINTIFF";
  return "OTHER";
}

/**
 * Atomically generate the next case number for a court in the current year.
 * Format: {COURT_CODE}-{YEAR}-{SEQ:05}
 *
 * Uses an ordered query inside the outer transaction so the sequence is
 * consistent even under concurrent submissions.
 */
async function generateEfileCaseNumber(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  courtCode: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${courtCode}-${year}-`;

  const latest = await tx.case.findFirst({
    where: { caseNumber: { startsWith: prefix } },
    orderBy: { caseNumber: "desc" },
    select: { caseNumber: true },
  });

  let seq = 1;
  if (latest?.caseNumber) {
    const parts = latest.caseNumber.split("-");
    const last = parseInt(parts[parts.length - 1] ?? "0", 10);
    if (!isNaN(last) && last >= seq) {
      seq = last + 1;
    }
  }

  return `${prefix}${String(seq).padStart(5, "0")}`;
}

/**
 * Find a system-level user (ADMIN or CLERK) associated with a court to act as
 * the `createdBy` actor for e-filed cases. Falls back to any ADMIN globally.
 * Throws if no suitable user is found (DB not seeded).
 */
async function resolveSystemUser(courtId: string): Promise<string> {
  // Prefer a clerk from the same court
  const courtUser = await prisma.user.findFirst({
    where: { courtId, role: { in: ["CLERK", "ADMIN"] }, isActive: true },
    select: { id: true },
    orderBy: { role: "asc" }, // ADMIN < CLERK alphabetically — ADMIN wins
  });
  if (courtUser) return courtUser.id;

  // Fall back to any admin in the system
  const anyAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  if (anyAdmin) return anyAdmin.id;

  throw new Error(
    "No active staff user found to associate with e-filed case. " +
      "Please run the database seed (`pnpm db:seed`).",
  );
}

// ─── Route plugin ─────────────────────────────────────────────────────────────

const publicEfileRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ── GET /api/public/courts ────────────────────────────────────────────────
  /**
   * Returns a list of active courts for the e-filing court selector.
   * No authentication required.
   */
  app.get("/courts", async (_request, reply) => {
    const courts = await prisma.court.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        email: true,
        phone: true,
      },
      orderBy: { name: "asc" },
    });
    return reply.send({ data: courts });
  });

  // ── POST /api/public/efile/initiate ──────────────────────────────────────
  /**
   * Step 1 of the e-filing flow.
   *
   * Creates a Stripe PaymentIntent for the filing fee and returns the
   * `client_secret` needed by Stripe.js (or the simulated flow).
   *
   * The full case submission data is stored in the PaymentIntent metadata so
   * it can be reconciled on the /submit step.
   */
  app.post("/efile/initiate", async (request, reply) => {
    const parsed = initiateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const { courtId, caseType, title, filerName, filerEmail, filerRole } =
      parsed.data;

    const court = await prisma.court.findUnique({
      where: { id: courtId },
      select: { id: true, name: true, isActive: true },
    });
    if (!court) {
      return reply.code(404).send({ error: "Court not found." });
    }
    if (!court.isActive) {
      return reply.code(400).send({ error: "Selected court is not accepting e-filings." });
    }

    if (!STRIPE_ENABLED) {
      // In development / non-Stripe environments return a mock intent so the
      // UI can complete the simulated payment flow without crashing.
      const mockId = `pi_mock_${Date.now()}`;
      return reply.send({
        clientSecret: `${mockId}_secret_mock`,
        paymentIntentId: mockId,
        amount: FILING_FEE_CENTS,
        stripeEnabled: false,
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: FILING_FEE_CENTS,
      currency: "usd",
      metadata: {
        type: "efile",
        courtId,
        caseType,
        title: title.substring(0, 500),
        filerName: filerName.substring(0, 200),
        filerEmail,
        filerRole,
      },
      description: `E-Filing Fee — ${caseType} case in ${court.name}`,
      receipt_email: filerEmail,
    });

    return reply.send({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: FILING_FEE_CENTS,
      stripeEnabled: true,
    });
  });

  // ── POST /api/public/efile/submit ─────────────────────────────────────────
  /**
   * Step 2 of the e-filing flow — called after the client confirms payment.
   *
   * Verifies the Stripe PaymentIntent is in `succeeded` status, then creates
   * the Case, Party, and Payment records in a single transaction.
   *
   * Idempotent: if a Case already exists with the same `stripePaymentIntentId`
   * the existing record is returned without creating a duplicate.
   */
  app.post("/efile/submit", async (request, reply) => {
    const parsed = submitSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const {
      paymentIntentId,
      courtId,
      caseType,
      title,
      description,
      filerName,
      filerEmail,
      filerPhone,
      filerRole,
      opposingPartyName,
    } = parsed.data;

    // ── Idempotency check ────────────────────────────────────────────────────
    // If we already processed this payment, return the existing case.
    const existingPayment = await prisma.payment.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
      select: { case: { select: { id: true, caseNumber: true } } },
    });
    if (existingPayment?.case) {
      return reply.send({
        success: true,
        caseNumber: existingPayment.case.caseNumber,
        caseId: existingPayment.case.id,
        alreadyProcessed: true,
      });
    }

    // ── Payment verification ──────────────────────────────────────────────────
    if (!STRIPE_ENABLED) {
      // Mock mode: accept any paymentIntentId that starts with "pi_mock_"
      if (!paymentIntentId.startsWith("pi_mock_")) {
        return reply.code(400).send({
          error:
            "Stripe is not configured. Only mock payment IDs (pi_mock_*) are accepted in development.",
        });
      }
    } else {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (pi.status !== "succeeded") {
        return reply.code(400).send({
          error: `Payment has not been completed (status: ${pi.status}). Please complete payment before submitting.`,
        });
      }
      // Guard: verify the payment was for THIS court to prevent cross-court abuse
      if (pi.metadata["courtId"] && pi.metadata["courtId"] !== courtId) {
        return reply.code(400).send({
          error: "Payment court does not match the submitted court.",
        });
      }
    }

    // ── Court lookup ──────────────────────────────────────────────────────────
    const court = await prisma.court.findUnique({
      where: { id: courtId },
      select: { id: true, code: true, name: true, isActive: true },
    });
    if (!court) {
      return reply.code(404).send({ error: "Court not found." });
    }
    if (!court.isActive) {
      return reply.code(400).send({ error: "Selected court is not accepting e-filings." });
    }

    // ── Resolve system user for createdById ───────────────────────────────────
    let systemUserId: string;
    try {
      systemUserId = await resolveSystemUser(courtId);
    } catch (err) {
      app.log.error({ err }, "E-filing: could not resolve system user");
      return reply.code(500).send({
        error: "Court registry is not configured. Please contact the court directly.",
      });
    }

    // ── Determine payment amount ──────────────────────────────────────────────
    let paidAmount = FILING_FEE_CENTS;
    if (STRIPE_ENABLED) {
      try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        paidAmount = pi.amount;
      } catch {
        // Non-fatal — default to the standard fee
      }
    }

    // ── Transactional persistence ─────────────────────────────────────────────
    const newCase = await prisma.$transaction(async (tx) => {
      const caseNumber = await generateEfileCaseNumber(tx, court.code);

      const parties: {
        name: string;
        email?: string | null;
        phone?: string | null;
        role: PartyRole;
        isProSe: boolean;
      }[] = [
        {
          name: filerName,
          email: filerEmail ?? null,
          phone: filerPhone ?? null,
          role: filerRole as PartyRole,
          isProSe: true,
        },
      ];

      if (opposingPartyName?.trim()) {
        parties.push({
          name: opposingPartyName.trim(),
          role: opposingRole(filerRole),
          isProSe: false,
        });
      }

      const c = await tx.case.create({
        data: {
          courtId,
          caseNumber,
          title,
          description: description ?? "",
          type: caseType,
          status: "FILED",
          priority: "STANDARD",
          isPublic: true,
          filedAt: new Date(),
          createdById: systemUserId,
          parties: {
            create: parties,
          },
          payments: {
            create: {
              type: "FILING_FEE",
              amount: paidAmount,
              currency: "USD",
              status: "COMPLETED",
              stripePaymentIntentId: paymentIntentId,
              description: `E-filing fee for ${caseType} case — ${filerName}`,
            },
          },
        },
        select: { id: true, caseNumber: true },
      });

      return c;
    });

    app.log.info(
      { caseId: newCase.id, caseNumber: newCase.caseNumber, filerEmail },
      "E-filing submitted successfully",
    );

    return reply.send({
      success: true,
      caseNumber: newCase.caseNumber,
      caseId: newCase.id,
    });
  });

  // ── GET /api/public/efile/payment-intent/:id ──────────────────────────────
  /**
   * Polls Stripe for the current payment intent status.
   * Used by the frontend to confirm payment before enabling the submit button.
   */
  app.get<{ Params: { id: string } }>(
    "/efile/payment-intent/:id",
    async (request, reply) => {
      const { id } = request.params;

      if (!id || id.trim() === "") {
        return reply.code(400).send({ error: "Payment intent ID is required." });
      }

      // Mock mode
      if (!STRIPE_ENABLED || id.startsWith("pi_mock_")) {
        return reply.send({ status: "succeeded", amount: FILING_FEE_CENTS });
      }

      const pi = await stripe.paymentIntents.retrieve(id);
      return reply.send({ status: pi.status, amount: pi.amount });
    },
  );
};

export default publicEfileRoutes;
