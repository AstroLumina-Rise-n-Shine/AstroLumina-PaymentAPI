import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import Stripe from "stripe";
import { env } from "../config/env.js";
import { getProduct, getAvailableProducts } from "../types/products.js";
import { Sentry } from "../instrument.js";
import { createError } from "../middleware/error-handler.js";
import { strictRateLimiter } from "../middleware/security.js";

const router = Router();

const stripe = new Stripe(env.STRIPE_SK, {
  apiVersion: env.STRIPE_API_VER as Stripe.LatestApiVersion,
});

// Validation schema — product keys are short, fixed catalog slugs.
export const productParamSchema = z.object({
  product: z.string().min(1, "Product key is required").max(64),
});

// Checkout body validation. ticketCount is bound to a Stripe quantity
// (product-specific inventory, bounded at 20), eventId flows into Stripe
// metadata (bounded and stripped of CR/LF so it can never forge headers or
// bloat metadata). Unknown properties keep being ignored to match the
// existing client contract.
export const checkoutBodySchema = z.object({
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
});

// Stripe session IDs look like "cs_test_<id>" / "cs_live_<id>" and are
// well under 255 characters.
export const sessionQuerySchema = z.object({
  session_id: z
    .string()
    .min(1, "session_id is required")
    .max(255, "session_id is too long"),
});

/**
 * POST /create-checkout-session/:product
 *
 * Unified endpoint for all product types.
 * For 'eveniment-constelatii', accepts ticketCount in body.
 *
 * Strictly rate-limited: creating checkout sessions triggers a Stripe
 * API call, so abusive hammering must back off well before the global
 * 30 req/min limiter intervenes.
 */
router.post(
  "/create-checkout-session/:product",
  strictRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    const SentryInstance = Sentry;

    try {
      // Validate product parameter
      const parseResult = productParamSchema.safeParse(req.params);
      if (!parseResult.success) {
        throw createError(400, "Missing product parameter");
      }

      // Validate body (ticketCount/eventId); malformed values are
      // rejected, unknown properties keep being ignored.
      const bodyResult = checkoutBodySchema.safeParse(req.body ?? {});
      if (!bodyResult.success) {
        throw createError(400, "Invalid checkout request body");
      }
      const ticketCount = bodyResult.data.ticketCount;
      const eventId = bodyResult.data.eventId;

      const productKey = parseResult.data.product;
      const product = getProduct(productKey);

      if (!product) {
        const available = getAvailableProducts();
        throw createError(
          400,
          `Unknown product "${productKey}". Available products: ${available.join(", ")}`,
        );
      }

      SentryInstance.setContext("checkout", {
        product: productKey,
        priceId: product.priceId,
        ticketCount,
      });

      const session = await SentryInstance.startSpan(
        { op: "stripe.checkout", name: `create-session-${productKey}` },
        async () =>
          stripe.checkout.sessions.create({
            ui_mode: "embedded",
            line_items: [{ price: product.priceId, quantity: ticketCount }],
            mode: "payment",
            redirect_on_completion: "never",
            metadata: {
              product: productKey,
              ticketCount: String(ticketCount),
              ...(eventId ? { eventId } : {}),
            },
          }),
      );

      res.json({ clientSecret: session.client_secret });
    } catch (error) {
      console.error("Checkout session error:", error);
      SentryInstance.captureException(error, {
        tags: { endpoint: "create-checkout-session" },
      });
      next(error);
    }
  },
);

/**
 * GET /session-status?session_id={SESSION_ID}
 *
 * Retrieve the status of a Stripe checkout session.
 */

router.get(
  "/session-status",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parseResult = sessionQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        throw createError(400, "Missing session_id query parameter");
      }

      const session = await Sentry.startSpan(
        { op: "stripe.retrieve", name: "retrieve-session" },
        async () =>
          stripe.checkout.sessions.retrieve(parseResult.data.session_id, {
            expand: ["payment_intent"],
          }),
      );

      res.json({
        status: session.status,
        payment_status: session.payment_status,
        customer_email: session.customer_details?.email,
        amount_total: session.amount_total,
        currency: session.currency,
      });
    } catch (error) {
      console.error("Session status error:", error);
      Sentry.captureException(error, {
        tags: { endpoint: "session-status" },
      });
      next(error);
    }
  },
);

/**
 * GET /products
 *
 * List available products (useful for frontend discovery).
 */
router.get("/products", (_req: Request, res: Response) => {
  const available = getAvailableProducts();
  const products = available.map((key) => {
    const product = getProduct(key)!;
    return { key, name: product.name, description: product.description };
  });
  res.json({ products });
});

export default router;
