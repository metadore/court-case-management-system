// Loaded as the first import in index.ts so env vars are set before
// Prisma (or anything else) initializes at module evaluation time.
try {
  process.loadEnvFile();
} catch {
  // No .env file — env vars must come from the host environment (production/CI)
}
