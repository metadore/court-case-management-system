import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyHelmet from "@fastify/helmet";
import fastifyCompress from "@fastify/compress";
import { Server } from "socket.io";
import { Readable } from "stream";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

import authRoutes from "./routes/auth.js";
import caseRoutes from "./routes/cases.js";
import documentRoutes from "./routes/documents.js";
import hearingRoutes from "./routes/hearings.js";
import notificationRoutes from "./routes/notifications.js";
import paymentRoutes from "./routes/payments.js";
import publicRoutes from "./routes/public.js";
import reportRoutes from "./routes/reports.js";
import searchRoutes from "./routes/search.js";
import signatureRoutes from "./routes/signatures.js";
import subscriptionRoutes from "./routes/subscriptions.js";
import lawyerRoutes from "./routes/lawyers.js";
import partyRoutes from "./routes/parties.js";
import userRoutes from "./routes/users.js";
import notificationProviderRoutes from "./routes/admin/notification-providers.js";
import outboundNotificationRoutes from "./routes/admin/outbound-notifications.js";
import notesRoutes from "./routes/notes.js";
import motionRoutes from "./routes/motions.js";
import evidenceRoutes from "./routes/evidence.js";
import checklistRoutes from "./routes/checklist.js";
import courtroomRoutes from "./routes/admin/courtrooms.js";
import analyticsRoutes from "./routes/admin/analytics.js";
import feeWaiverRoutes from "./routes/fee-waivers.js";
import feeWaiverAdminRoutes from "./routes/admin/fee-waivers-admin.js";
import templateRoutes from "./routes/templates.js";
import totpRoutes from "./routes/totp.js";
import summaryRoutes from "./routes/summary.js";
import recordingRoutes from "./routes/recordings.js";
import publicEfileRoutes from "./routes/public-efile.js";
import { setupSocketHandlers } from "./lib/socket.js";
import { USE_S3 } from "./lib/storage.js";
import { startNotificationWorker } from "./notifications/worker.js";
import { startSessionCleanup } from "./lib/cleanupSessions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(process.env["UPLOADS_DIR"] ?? path.join(__dirname, "..", "uploads"));

export async function buildServer() {
  // Validate required secrets on startup
  const jwtSecret = process.env["JWT_SECRET"];
  if (!jwtSecret || jwtSecret === "change-me-in-production") {
    console.error("FATAL: JWT_SECRET environment variable is not set or is using the default value.");
    console.error("Set a strong, unique JWT_SECRET in production.");
    process.exit(1);
  }

  // Validate SIGNING_SECRET
  const signingSecret = process.env["SIGNING_SECRET"];
  if (!signingSecret || signingSecret === "change-me-in-production-signing-secret") {
    console.error("FATAL: SIGNING_SECRET environment variable is not set or is using the default value.");
    console.error("Set a strong, unique SIGNING_SECRET in production.");
    process.exit(1);
  }

  // Validate STRIPE_SECRET_KEY
  const stripeKey = process.env["STRIPE_SECRET_KEY"];
  if (!stripeKey || stripeKey === "sk_test_placeholder") {
    console.warn("WARNING: STRIPE_SECRET_KEY is not set or using placeholder. Payment features will be unavailable.");
  }

  const app = Fastify({
    logger: {
      level: process.env["LOG_LEVEL"] ?? "info",
      transport:
        process.env["NODE_ENV"] === "development"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 1 * 1024 * 1024, // 1 MB for JSON bodies; multipart has its own 50 MB limit
  });

  // Gzip/br compression for all responses
  await app.register(fastifyCompress, { global: true });

  // Security headers — minimal CSP appropriate for a JSON + SVG API
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        imgSrc: ["data:"],
        styleSrc: ["'unsafe-inline'"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-origin" },
  });

  // Rate limiting - global
  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (request) => {
      return request.ip;
    },
  });

  await app.register(fastifyCors, {
    origin: process.env["CORS_ORIGIN"]?.split(",") ?? ["http://localhost:3000"],
    credentials: true,
  });

  await app.register(fastifyJwt, {
    secret: jwtSecret,
    sign: { expiresIn: "1d" }, // Reduced from 7d to 1d; no refresh tokens (L1 fix)
  });

  await app.register(fastifyMultipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  });

  // Only serve static uploads from disk when NOT using S3 storage
  if (!USE_S3) {
    await app.register(fastifyStatic, {
      root: UPLOADS_DIR,
      prefix: "/uploads/",
      decorateReply: false,
      // Prevent path traversal
      redirect: false,
      wildcard: false,
      // Prevent directory listing
      serveDotFiles: false,
      list: false,
    });
  }

  // Stricter rate limits on auth routes
  app.register(async function (authScoped) {
    await authScoped.register(fastifyRateLimit, {
      max: 5,
      timeWindow: "1 minute",
      keyGenerator: (request) => request.ip,
    });
    await authScoped.register(authRoutes);
  }, { prefix: "/api/auth" });

  // Stricter rate limits on TOTP routes (H3 fix)
  app.register(async function (totpScoped) {
    await totpScoped.register(fastifyRateLimit, {
      max: 10,
      timeWindow: "1 minute",
      keyGenerator: (request) => request.ip,
    });
    await totpScoped.register(totpRoutes);
  }, { prefix: "/api" });

  // Routes
  await app.register(publicRoutes, { prefix: "/api/public" });
  await app.register(publicEfileRoutes, { prefix: "/api/public" });
  await app.register(caseRoutes, { prefix: "/api" });
  await app.register(documentRoutes, { prefix: "/api" });
  await app.register(hearingRoutes, { prefix: "/api" });
  await app.register(notificationRoutes, { prefix: "/api/notifications" });
  await app.register(paymentRoutes, { prefix: "/api" });
  await app.register(reportRoutes, { prefix: "/api" });
  await app.register(searchRoutes, { prefix: "/api" });
  await app.register(signatureRoutes, { prefix: "/api" });
  await app.register(subscriptionRoutes, { prefix: "/api/subscriptions" });
  await app.register(userRoutes, { prefix: "/api" });
  await app.register(notificationProviderRoutes, { prefix: "/api/admin/notification-providers" });
  await app.register(outboundNotificationRoutes, { prefix: "/api/admin/outbound-notifications" });
  await app.register(lawyerRoutes, { prefix: "/api" });
  await app.register(partyRoutes, { prefix: "/api" });
  await app.register(summaryRoutes, { prefix: "/api" });
  await app.register(recordingRoutes, { prefix: "/api" });
  await app.register(notesRoutes, { prefix: "/api" });
  await app.register(motionRoutes, { prefix: "/api" });
  await app.register(evidenceRoutes, { prefix: "/api" });
  await app.register(checklistRoutes, { prefix: "/api" });
  await app.register(courtroomRoutes, { prefix: "/api/admin" });
  await app.register(analyticsRoutes, { prefix: "/api/admin" });
  await app.register(feeWaiverRoutes, { prefix: "/api" });
  await app.register(feeWaiverAdminRoutes, { prefix: "/api" });
  await app.register(templateRoutes, { prefix: "/api" });

  app.get("/health", async () => ({ status: "ok", ts: new Date().toISOString() }));

  // Socket.io — attach to the raw http server after listen
  app.addHook("onReady", async () => {
    const io = new Server(app.server, {
      cors: {
        origin: process.env["CORS_ORIGIN"]?.split(",") ?? ["http://localhost:3000"],
        credentials: true,
      },
    });

    // Socket.IO authentication middleware
    io.use((socket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error("Authentication required"));
      }

      try {
        const decoded = app.jwt.verify(token as string);
        (socket as any).user = decoded;
        next();
      } catch {
        return next(new Error("Invalid or expired token"));
      }
    });

    setupSocketHandlers(io);
    app.decorate("io", io);

    startNotificationWorker();
    startSessionCleanup(); // purge expired blacklisted tokens every hour
  });

  // Capture raw body for Stripe webhook HMAC verification before JSON parsing consumes it.
  // The hook replays the same bytes so the normal JSON parser still works for other routes.
  app.addHook("preParsing", async (request, _reply, payload) => {
    if (!request.url.includes("/stripe-webhook")) return payload;
    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }
    const rawBody = Buffer.concat(chunks);
    (request as unknown as Record<string, unknown>)["rawBody"] = rawBody;
    const replay = new Readable();
    replay.push(rawBody);
    replay.push(null);
    return replay;
  });

  // request.id is already set by genReqId — hook kept as extension point
  app.addHook("onRequest", async (_request) => {});

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    io: Server;
  }
}