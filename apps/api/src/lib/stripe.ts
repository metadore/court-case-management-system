import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env["STRIPE_SECRET_KEY"] ?? "";
const STRIPE_API_VERSION = process.env["STRIPE_API_VERSION"] ?? "2025-02-24.acacia";

/** Whether Stripe is properly configured */
export const STRIPE_ENABLED = Boolean(STRIPE_SECRET_KEY) && !STRIPE_SECRET_KEY.startsWith("sk_test_placeholder") && STRIPE_SECRET_KEY !== "sk_test_placeholder";

if (!STRIPE_ENABLED) {
  console.warn("STRIPE_SECRET_KEY is not properly configured — payment features will be unavailable");
}

// H5 fix: fail gracefully when Stripe is not configured
export function getStripeClient(): Stripe | null {
  if (!STRIPE_ENABLED) {
    return null;
  }
  return new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
  });
}

// Backward-compatible export for existing code
// Returns a stub that throws clear errors when not configured
function createStripeProxy(): Stripe {
  const client = getStripeClient();
  return new Proxy({} as Stripe, {
    get(_target, prop) {
      if (client) {
        return (client as any)[prop];
      }
      // Return a function that throws a clear error
      return (..._args: unknown[]) => {
        throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY environment variable.");
      };
    },
  });
}

export const stripe = createStripeProxy();
