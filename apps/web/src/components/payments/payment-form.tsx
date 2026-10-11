import React, { useMemo, useState } from "react";
import { CardElement, useElements, useStripe } from "@stripe/react-stripe-js";

export type PaymentFormProps = {
  amount: number; // in minor currency units (e.g., cents)
  currency?: string; // default: "usd"
  clientSecret: string;
  submitLabel?: string;
  loadingLabel?: string;
  onSuccess?: () => void;
  onError?: (message: string) => void;
};

export function PaymentForm({
  amount,
  currency = "usd",
  clientSecret,
  submitLabel = "Pay",
  loadingLabel = "Processing...",
  onSuccess,
  onError,
}: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const formatted = useMemo(() => (amount / 100).toFixed(2), [amount]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    try {
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        onError?.("Card element not found.");
        return;
      }

      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (result.error) {
        onError?.(result.error.message ?? "Payment failed.");
        return;
      }

      if (result.paymentIntent?.status === "succeeded") {
        onSuccess?.();
      } else {
        onError?.(`Payment status: ${result.paymentIntent?.status ?? "unknown"}`);
      }
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Payment failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-sm text-gray-700">
        Amount:{" "}
        <span className="font-medium text-gray-900">
          {currency.toUpperCase()} {formatted}
        </span>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="mb-2 text-sm font-medium text-gray-700">Card details</div>
        <div className="stripe-card">
          <CardElement options={{ hidePostalCode: true }} />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Payments are processed via Stripe.
        </p>
      </div>

      <button
        type="submit"
        disabled={!stripe || !clientSecret || submitting}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? loadingLabel : submitLabel}
      </button>
    </form>
  );
}
