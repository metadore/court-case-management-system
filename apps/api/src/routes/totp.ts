import type { FastifyInstance } from "fastify";
import { prisma } from "@tpt-court/database";
import { requireAuth } from "../middleware/requireAuth.js";
import { z } from "zod";
import { randomBytes, createHmac, createCipheriv, createDecipheriv, scryptSync } from "crypto";
import { recordAuditLog } from "../lib/audit.js";
import QRCode from "qrcode";
import type { JwtPayload } from "@tpt-court/types";

const APP_NAME = process.env["APP_NAME"] ?? "TPT Court";
const TOTP_DIGITS = 6;
const TOTP_STEP = 30; // seconds

// ── AES-256-GCM encryption for TOTP secrets at rest ──────────────────────────
// Format stored in DB: "v1:<ivHex>:<authTagHex>:<ciphertextHex>"

function getTotpEncryptionKey(): Buffer {
  const secret = process.env["SIGNING_SECRET"];
  if (!secret) throw new Error("SIGNING_SECRET is not set");
  return scryptSync(secret, "tpt-court-totp-v1", 32);
}

export function encryptTotpSecret(plaintext: string): string {
  const key = getTotpEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptTotpSecret(stored: string): string {
  if (!stored.startsWith("v1:")) {
    // Legacy plaintext secret — return as-is during migration window
    return stored;
  }
  const parts = stored.split(":");
  if (parts.length !== 4) throw new Error("Invalid TOTP secret format");
  const [, ivHex, authTagHex, ciphertextHex] = parts as [string, string, string, string];
  const key = getTotpEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return decipher.update(Buffer.from(ciphertextHex, "hex")).toString("utf8") + decipher.final("utf8");
}

// ── Pure-Node TOTP (RFC 6238) ─────────────────────────────────────────────────

function base32Decode(str: string): Buffer {
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const input = str.toUpperCase().replace(/=+$/, "");
  const bytes: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of input) {
    const val = CHARS.indexOf(ch);
    if (val < 0) continue;
    buf = (buf << 5) | val;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function base32Encode(buf: Buffer): string {
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let out = "";
  let buf2 = 0;
  let bits = 0;
  for (const byte of buf) {
    buf2 = (buf2 << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += CHARS[(buf2 >> bits) & 0x1f];
    }
  }
  if (bits > 0) out += CHARS[(buf2 << (5 - bits)) & 0x1f];
  while (out.length % 8 !== 0) out += "=";
  return out;
}

function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

function verifyTotp(plaintextSecret: string, token: string): boolean {
  // Accept current window ±1 to handle clock skew
  const keyBuf = base32Decode(plaintextSecret);
  const now = Math.floor(Date.now() / 1000 / TOTP_STEP);
  for (const delta of [-1, 0, 1]) {
    const counter = now + delta;
    const msg = Buffer.alloc(8);
    msg.writeUInt32BE(0, 0);
    msg.writeUInt32BE(counter, 4);
    const hmac = createHmac("sha1", keyBuf).update(msg).digest();
    const offset = hmac[19]! & 0xf;
    const code =
      (((hmac[offset]! & 0x7f) << 24) |
        ((hmac[offset + 1]! & 0xff) << 16) |
        ((hmac[offset + 2]! & 0xff) << 8) |
        (hmac[offset + 3]! & 0xff)) %
      Math.pow(10, TOTP_DIGITS);
    if (String(code).padStart(TOTP_DIGITS, "0") === token) return true;
  }
  return false;
}

// ── Routes ────────────────────────────────────────────────────────────────────

export default async function totpRoutes(app: FastifyInstance) {
  // ── QR code for the current user's pending TOTP secret ─────────────────
  app.get("/totp/qr", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { email: true, totpSecret: true, totpEnabled: true },
    });
    if (!user?.totpSecret || user.totpEnabled) {
      return reply.status(400).send({ error: "NO_PENDING_SETUP", statusCode: 400 });
    }
    const plainSecret = decryptTotpSecret(user.totpSecret);
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(APP_NAME)}:${encodeURIComponent(user.email)}?secret=${plainSecret}&issuer=${encodeURIComponent(APP_NAME)}`;
    const svg = await QRCode.toString(otpauthUrl, { type: "svg", margin: 1 });
    return reply.header("Content-Type", "image/svg+xml").send(svg);
  });

  // ── Begin 2FA setup ─────────────────────────────────────────────────────
  app.post("/totp/setup", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { id: true, email: true, totpEnabled: true },
    });
    if (!user) return reply.status(404).send({ error: "NOT_FOUND", statusCode: 404 });
    if (user.totpEnabled) {
      return reply.status(409).send({ error: "ALREADY_ENABLED", message: "2FA is already enabled.", statusCode: 409 });
    }

    const plainSecret = generateSecret();
    const encryptedSecret = encryptTotpSecret(plainSecret);
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(APP_NAME)}:${encodeURIComponent(user.email)}?secret=${plainSecret}&issuer=${encodeURIComponent(APP_NAME)}`;

    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: encryptedSecret } });

    // Return the plaintext secret only here (user needs it to provision their authenticator app)
    return reply.send({ data: { secret: plainSecret, otpauthUrl } });
  });

  // ── Confirm 2FA setup ───────────────────────────────────────────────────
  app.post("/totp/confirm", { preHandler: [requireAuth] }, async (request, reply) => {
    const schema = z.object({ token: z.string().length(6) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "Token must be 6 digits.", statusCode: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { id: true, totpSecret: true, totpEnabled: true },
    });
    if (!user?.totpSecret) {
      return reply.status(400).send({ error: "NO_SECRET", message: "Call /api/totp/setup first.", statusCode: 400 });
    }
    if (user.totpEnabled) {
      return reply.status(409).send({ error: "ALREADY_ENABLED", message: "2FA already active.", statusCode: 409 });
    }

    const plainSecret = decryptTotpSecret(user.totpSecret);
    if (!verifyTotp(plainSecret, parsed.data.token)) {
      return reply.status(400).send({ error: "INVALID_TOKEN", message: "OTP code is incorrect or expired.", statusCode: 400 });
    }

    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });

    await recordAuditLog({
      prisma,
      actor: { id: request.user.id, role: request.user.role },
      courtId: request.user.courtId ?? null,
      entityType: "USER",
      entityId: request.user.id,
      action: "TOTP_ENABLED",
      fromState: "disabled",
      toState: "enabled",
    });

    return reply.send({ data: { totpEnabled: true } });
  });

  // ── Disable 2FA ─────────────────────────────────────────────────────────
  app.post("/totp/disable", { preHandler: [requireAuth] }, async (request, reply) => {
    const schema = z.object({ token: z.string().length(6) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "Token must be 6 digits.", statusCode: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { id: true, totpSecret: true, totpEnabled: true },
    });
    if (!user?.totpEnabled || !user.totpSecret) {
      return reply.status(400).send({ error: "NOT_ENABLED", message: "2FA is not currently enabled.", statusCode: 400 });
    }

    const plainSecret = decryptTotpSecret(user.totpSecret);
    if (!verifyTotp(plainSecret, parsed.data.token)) {
      return reply.status(400).send({ error: "INVALID_TOKEN", message: "OTP code is incorrect or expired.", statusCode: 400 });
    }

    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } });

    await recordAuditLog({
      prisma,
      actor: { id: request.user.id, role: request.user.role },
      courtId: request.user.courtId ?? null,
      entityType: "USER",
      entityId: request.user.id,
      action: "TOTP_DISABLED",
      fromState: "enabled",
      toState: "disabled",
    });

    return reply.send({ data: { totpEnabled: false } });
  });

  // ── Verify OTP at login time ────────────────────────────────────────────
  // Accepts pending-TOTP tokens (issued at login) — upgrades to a full JWT on success.
  app.post("/totp/verify", { preHandler: [requireAuth] }, async (request, reply) => {
    const schema = z.object({ token: z.string().length(6) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "Token must be 6 digits.", statusCode: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { id: true, email: true, role: true, courtId: true, firstName: true, lastName: true, totpSecret: true, totpEnabled: true },
    });
    if (!user?.totpEnabled || !user.totpSecret) {
      return reply.send({ data: { verified: true } });
    }

    const plainSecret = decryptTotpSecret(user.totpSecret);
    if (!verifyTotp(plainSecret, parsed.data.token)) {
      return reply.status(400).send({ error: "INVALID_TOKEN", message: "OTP code is incorrect or expired.", statusCode: 400 });
    }

    // If caller had a pending-TOTP token, upgrade to a full access token now
    const callerPayload = request.user as unknown as JwtPayload;
    if (callerPayload.totpPending === true) {
      const fullToken = app.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        courtId: user.courtId,
        firstName: user.firstName,
        lastName: user.lastName,
      } as JwtPayload);
      return reply.send({ data: { verified: true, token: fullToken } });
    }

    return reply.send({ data: { verified: true } });
  });
}
