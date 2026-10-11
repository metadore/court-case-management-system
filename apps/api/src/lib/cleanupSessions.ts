/**
 * Session cleanup utility.
 * M3 fix: Removes expired session records from the database to prevent unbounded growth.
 * Call this function from a scheduled job (cron) or at server startup.
 */

import { prisma } from "@tpt-court/database";

export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });
  return result.count;
}

/**
 * Run cleanup on a schedule. Call with desired interval (default: every hour).
 */
export function startSessionCleanup(intervalMs: number = 60 * 60 * 1000): NodeJS.Timeout {
  const timer = setInterval(async () => {
    try {
      const count = await cleanupExpiredSessions();
      if (count > 0) {
        console.log(`[cleanup] Removed ${count} expired session(s)`);
      }
    } catch (error) {
      console.error("[cleanup] Failed to clean up sessions:", error);
    }
  }, intervalMs);

  // Make the timer not prevent process exit
  if (timer?.unref) {
    timer.unref();
  }

  return timer;
}