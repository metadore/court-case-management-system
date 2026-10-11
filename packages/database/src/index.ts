import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  return new PrismaClient({
    log:
      process.env["NODE_ENV"] === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

// Singleton for dev to avoid exhausting connections during hot reload
export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env["NODE_ENV"] !== "production") {
  globalThis.__prisma = prisma;
}

export * from "@prisma/client";
