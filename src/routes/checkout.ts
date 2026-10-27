import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { Sentry } from "../instrument.js";
import { createError } from "../middleware/error-handler.js";
import { strictRateLimiter } from "../middleware/security.js";

const router = Router();

// Revolut Merchant API base URL
// Revolut Merchant API base URL — the API path is /api/orders, not /v1/orders.
// The API version is a date string (e.g. 2026-08-17), sent via the
// Revolut-Api-Version request header.
// Use sandbox-merchant.revolut.com for testing, merchant.revolut.com for production.
const REVOLUT_API_BASE =
  env.REVOLUT_PAY_ENVIRONMENT === "sandbox"
    ? "https://sandbox-merchant.revolut.com"
    : "https://merchant.revolut.com";
const REVOLUT_API_VERSION = env.REVOLUT_PAY_API_VERSION;

// Checkout body validation.
// The frontend owns the product catalog; the API only receives amount + currency.
// ticketCount is for events (bounded at 20), eventId flows into metadata.
// Unknown properties keep being ignored to match the existing client contract.
export const checkoutBodySchema = z.object({
  amount: z.coerce
    .number()
    .int()
    .min(1, "amount must be at least 1")
    .max(100_000_000, "amount is too large"),
  currency: z
    .string()
    .min(3, "currency must be a 3-letter ISO 4217 code")
    .max(3, "currency must be a 3-letter ISO 4217 code")
    .regex(/^[A-Z]{3}$/, "currency must be uppercase 3-letter ISO code"),
  ticketCount: z.coerce
    .number()
    .int()
    .min(1, "ticketCount must be at least 1")
    .max(20, "ticketCount must be at most 20")
    .default(1),
  eventId: z
    .string()
    .min(1)
    .max(100)
    // Reject CR/LF and other control characters outright.
    .regex(/^[^\r\n\u0000-\u001f\u007f]*$/, "eventId contains invalid characters")
    .optional(),
  product: z
    .string()
    .min(1)
    .max(64)
    .optional(), // informational metadata, not used for pricing
});

/**
 * Create a Revolut Pay order via Merchant API.
 * Returns the order token (publicId) that the frontend uses to mount the widget.
 */
async function createRevolutOrder(
  amount: number,
  currency: string,
  metadata: Record<string, string>
): Promise<string> {
  const response = await fetch(`${REVOLUT_API_BASE}/api/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.REVOLUT_PAY_SECRET_KEY}`,
      "Content-Type": "application/json",
      "Revolut-Api-Version": REVOLUT_API_VERSION,
    },
    body: JSON.stringify({
      amount,
      currency,
      metadata,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Revolut order creation failed: ${response.status} - ${errorText}`
    );
  }

  const data = (await response.json()) as { token: string };
  return data.token; // This is the publicId used by the frontend widget
}

/**
 * POST /create-order
 *
 * Unified endpoint for all product types.
 * The frontend sends amount + currency from its product catalog.
 * For events, ticketCount is included in metadata.
 *
 * Strictly rate-limited: creating orders triggers a Revolut API call,
 * so abusive hammering must back off well before the global limiter intervenes.
 */
router.post(
  "/create-order",
  strictRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    const SentryInstance = Sentry;

    try {
      // Validate body (amount/currency/ticketCount/eventId/product)
      const bodyResult = checkoutBodySchema.safeParse(req.body ?? {});
      if (!bodyResult.success) {
        throw createError(400, "Invalid checkout request body");
      }
      const { amount, currency, ticketCount, eventId, product } =
        bodyResult.data;

      SentryInstance.setContext("checkout", {
        amount,
        currency,
        ticketCount,
        product: product ?? "unknown",
      });

      const token = await SentryInstance.startSpan(
        { op: "revolut.create-order", name: `create-order` },
        async () =>
          createRevolutOrder(amount, currency, {
            ticketCount: String(ticketCount),
            ...(eventId ? { eventId } : {}),
            ...(product ? { product } : {}),
          }),
      );

      res.json({ token });
    } catch (error) {
      console.error("Revolut order creation error:", error);
      SentryInstance.captureException(error, {
        tags: { endpoint: "create-order" },
      });
      next(error);
    }
  },
);

export default router;