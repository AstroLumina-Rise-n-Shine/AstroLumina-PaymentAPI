// Sentry instrument must be loaded first
import { Sentry } from "./instrument.js";

import express from "express";
import compression from "compression";
import morgan from "morgan";
import { env } from "./config/env.js";
import {
  securityHeaders,
  permissionsPolicy,
  originGuard,
  corsMiddleware,
  rateLimiter,
} from "./middleware/security.js";
import {
  payloadTooLargeHandler,
  notFoundHandler,
  globalErrorHandler,
} from "./middleware/error-handler.js";
import healthRouter from "./routes/health.js";
import { metricsHandler, metricsMiddleware } from "./metrics.js";
import checkoutRouter from "./routes/checkout.js";

const isProduction = env.NODE_ENV === "production";

const app = express();

app.set("trust proxy", 1);

// Hide framework fingerprinting via the X-Powered-By header.
app.disable("x-powered-by");

// ─── Metrics ─────────────────────────────────────────────────
// Registered before the security middlewares so Prometheus scrapes are
// never rate-limited nor CORS-filtered. Reachable only in-cluster (the
// Traefik routes expose /api/*, never /metrics).
app.get("/metrics", metricsHandler);
app.use(metricsMiddleware);

// ─── Security ────────────────────────────────────────────────
app.use(securityHeaders);
app.use(permissionsPolicy);
// Strict origin guard: must run before cors() so disallowed (but
// present) Origin headers get a plain 403 instead of CORS filtering.
app.use(originGuard);
app.use(corsMiddleware);
app.use(rateLimiter);

// ─── Compression ─────────────────────────────────────────────
app.use(compression());

// ─── Logging ─────────────────────────────────────────────────
app.use(morgan(isProduction ? "combined" : "dev"));

// ─── Body parser ─────────────────────────────────────────────
// 256kb is a hard upper bound for this API. There is deliberately no
// dedicated raw-body parser for Revolut Pay webhooks: this service does not
// expose a webhook route at all (Revolut Pay orders are verified
// client-side via the payment widget), so the small global limit never
// conflicts with signature verification. If a webhook route is ever
// added, mount a raw parser for it before this parser instead of
// raising the global limit — see the security-hardening spec.
app.use(express.json({ limit: "256kb" }));

// ─── Robots ──────────────────────────────────────────────────
// Publicly disallow crawling of the API surface (served as plain text,
// before the routers and the 404 handler).
app.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send("User-agent: *\nDisallow: /\n");
});

// ─── Routes ──────────────────────────────────────────────────
app.use(healthRouter);
app.use(checkoutRouter);

// ─── Error handling ──────────────────────────────────────────
app.use(payloadTooLargeHandler);
app.use(notFoundHandler);

// Sentry error handler — must be after routes
Sentry.setupExpressErrorHandler(app);

// Global error handler — must be last
app.use(globalErrorHandler);

// ─── Server startup ──────────────────────────────────────────
const server = app.listen(env.PAYMENT_API_SERVER_PORT, () => {
  console.log(
    `🚀 Payment API running on http://localhost:${env.PAYMENT_API_SERVER_PORT}`,
  );
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   Node: ${process.version}`);
});

// ─── Connection tracking for graceful shutdown ────────────────
const connections = new Set<import("net").Socket>();

server.on("connection", (conn) => {
  connections.add(conn);
  conn.on("close", () => connections.delete(conn));
});

// ─── Graceful shutdown ───────────────────────────────────────
const gracefulShutdown = async (signal: string) => {
  console.log(`\n⚠️  Received ${signal}. Starting graceful shutdown...`);

  server.close(async () => {
    console.log("   HTTP server closed.");

    await Sentry.close(2000);
    console.log("   Sentry flushed.");

    process.exit(0);
  });

  for (const conn of connections) {
    conn.destroy();
  }

  setTimeout(() => {
    console.error("   Forced shutdown after timeout.");
    process.exit(1);
  }, 10_000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
