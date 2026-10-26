// instrument.ts — must be imported before all other modules
import { env } from "./config/env.js";

import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

if (env.PAYMENT_API_SENTRY_DSN) {
  const isProduction = env.NODE_ENV === "production";

  Sentry.init({
    dsn: env.PAYMENT_API_SENTRY_DSN,
    environment: env.NODE_ENV,

    sampleRate: 1.0,
    includeLocalVariables: true,
    maxBreadcrumbs: 100,

    tracesSampler: (samplingContext) => {
      if (samplingContext?.transactionContext?.name?.includes("/health")) {
        return 0.01;
      }
      if (samplingContext?.transactionContext?.name?.includes("/api/")) {
        return isProduction ? 0.2 : 1.0;
      }
      return isProduction ? 0.1 : 1.0;
    },

    tracePropagationTargets: [
      "localhost",
      /^https:\/\/merchant\.revolut\.com/,
      /^https:\/\/astrolumina\.pages\.dev/,
      /^https:\/\/develop\.astrolumina\.pages\.dev/,
      /^https:\/\/.*\.astrolumina\.com/,
      /^https:\/\/.*\.astrolumina\.ro/,
    ],

    integrations: [
      // @ts-expect-error — version mismatch between @sentry/node 10.x and @sentry/profiling-node 8.x
      nodeProfilingIntegration(),
      Sentry.captureConsoleIntegration({ levels: ["error", "warn"] }),
      Sentry.anrIntegration({ captureStackTrace: true }),
    ],
    profileSessionSampleRate: isProduction ? 0.1 : 1.0,
    profileLifecycle: "trace",
    autoSessionTracking: true,
    sendDefaultPii: true,
    beforeSend: (event, _hint) => {
      if (event.exception?.values) {
        for (const exception of event.exception.values) {
          if (exception.value) {
            exception.value = exception.value
              .replace(/sk_[a-zA-Z0-9_]+/g, "sk_[REDACTED]")
              .replace(
                /REVOLUT_PAY_SECRET_KEY['":\s]*['"]?[\w-]+['"]?/gi,
                "REVOLUT_PAY_SECRET_KEY=[REDACTED]",
              );
          }
        }
      }
      if (event.request?.data && typeof event.request.data === "object") {
        const data = event.request.data as Record<string, unknown>;
        for (const key of Object.keys(data)) {
          if (
            key.toLowerCase().includes("secret") ||
            key.toLowerCase().includes("key")
          ) {
            data[key] = "[REDACTED]";
          }
        }
      }
      return event;
    },

    beforeSendSpan: (span) => {
      span.data = { ...span.data, "service.name": "astrolumina-payment-api" };
      return span;
    },

    initialScope: {
      tags: {
        service: "astrolumina-payment-api",
        runtime: "node.js",
        framework: "express",
      },
    },

    enableLogs: true,
  });
}

export { Sentry };
