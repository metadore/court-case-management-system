import { prisma } from "@tpt-court/database";
import { getDefaultProvider } from "./providers/registry.js";
import type { SmsProvider, EmailProvider } from "./providers/base.js";

const POLL_INTERVAL_MS = 30_000;
const BATCH_SIZE = 20;
// Retry delays: 1 min, 5 min, 15 min
const RETRY_DELAYS_MS = [60_000, 300_000, 900_000];
const MAX_RETRY_DELAY_MS = 900_000;

export function startNotificationWorker(): NodeJS.Timeout {
  const handle = setInterval(() => {
    runWorkerTick().catch((err: unknown) => {
      console.error("[notification-worker] tick error:", err);
    });
  }, POLL_INTERVAL_MS);

  // Run immediately on start so there's no 30s cold-start delay
  runWorkerTick().catch((err: unknown) => {
    console.error("[notification-worker] initial tick error:", err);
  });

  return handle;
}

async function runWorkerTick(): Promise<void> {
  const now = new Date();

  const pending = await prisma.outboundNotification.findMany({
    where: { status: "PENDING", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
    take: BATCH_SIZE,
  });

  if (pending.length === 0) return;

  // Mark the whole batch as SENDING atomically before dispatching
  const ids = pending.map((r) => r.id);
  await prisma.outboundNotification.updateMany({
    where: { id: { in: ids }, status: "PENDING" },
    data: { status: "SENDING" },
  });

  await Promise.allSettled(
    pending.map(async (item) => {
      try {
        const provider = await getDefaultProvider(item.channel);
        if (!provider) {
          throw new Error(`No active default ${item.channel} provider configured`);
        }

        let messageId: string;
        if (item.channel === "SMS") {
          messageId = (await (provider as SmsProvider).send(item.recipient, item.body)).messageId;
        } else {
          messageId = (await (provider as EmailProvider).send({
            to: item.recipient,
            subject: item.subject ?? "(no subject)",
            html: item.body,
          })).messageId;
        }

        await prisma.outboundNotification.update({
          where: { id: item.id },
          data: {
            status: "SENT",
            sentAt: new Date(),
            providerRef: messageId,
            providerError: null,
          },
        });
      } catch (err) {
        const attempts = item.attempts + 1;
        const hasMoreRetries = attempts < item.maxAttempts;
        const delayMs = RETRY_DELAYS_MS[attempts - 1] ?? MAX_RETRY_DELAY_MS;

        await prisma.outboundNotification.update({
          where: { id: item.id },
          data: {
            status: hasMoreRetries ? "PENDING" : "FAILED",
            attempts,
            nextRetryAt: hasMoreRetries ? new Date(Date.now() + delayMs) : null,
            scheduledAt: hasMoreRetries ? new Date(Date.now() + delayMs) : item.scheduledAt,
            providerError: err instanceof Error ? err.message : String(err),
          },
        });
      }
    })
  );
}
