import helmet from "helmet";
import cors, { type CorsOptions } from "cors";
import rateLimit from "express-rate-limit";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { defaultOrigins } from "../config/cors.js";

// ─── Security headers ────────────────────────────────────────
// Explicit helmet configuration instead of the insecure-by-design
// defaults: a locked-down CSP for an API (no inline scripts, frames,
// forms or base URIs), cross-origin resource accessibility for the
// SPA, no referrer leakage, long-lived HSTS and clickjacking denial.
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  referrerPolicy: { policy: "no-referrer" },
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: "deny" },
});

// Restrict browser features the API never uses.
export const permissionsPolicy = (
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  next();
};

// ─── CORS ────────────────────────────────────────────────────
// Normalise an origin string: trim, drop empty values, strip the
// trailing slash and keep only http/https URLs. Returns the URL
// origin (host lowercased, default ports removed) or null when the
// value is not a valid http/https URL.
function normalizeOrigin(origin: string): string | null {
  const trimmed = origin.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

// Split an origin list on commas, normalise each entry and reject
// any wildcard: a silent `*` allowlist is a CORS misconfiguration.
function buildCorsAllowlist(rawOrigins: string[]): string[] {
  const origins = rawOrigins
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (origins.includes("*")) {
    throw new Error(
      "CORS misconfiguration: wildcard origins ('*') are not allowed. " +
        "List the exact http/https origins in CORS_ORIGINS instead.",
    );
  }

  const normalized = origins.map(normalizeOrigin);
  const invalid = origins.filter((_, i) => normalized[i] === null);
  if (invalid.length > 0) {
    throw new Error(
      `CORS misconfiguration: invalid origin(s) ${invalid.join(", ")} — ` +
        "every entry must be a valid http/https URL.",
    );
  }

  return [...new Set(normalized as string[])];
}

const corsOrigins = buildCorsAllowlist(
  env.CORS_ORIGINS ? [env.CORS_ORIGINS] : defaultOrigins,
);

// Strict origin guard: reject requests that present an Origin header
// outside the allowlist. Requests without an Origin header
// (server-to-server calls, curl, the ZAP scanner) stay allowed.
export function originGuard(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin) {
    const normalized = normalizeOrigin(origin.trim());
    if (!normalized || !corsOrigins.includes(normalized)) {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }
  }
  next();
}

const corsOptions: CorsOptions = {
  origin: corsOrigins,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: false,
  maxAge: 600,
  optionsSuccessStatus: 204,
};

export const corsMiddleware = cors(corsOptions);

// ─── Rate limiting ───────────────────────────────────────────
export const rateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests from this IP, please try again after a minute",
  },
});

// Stricter limiter for abuse-prone, expensive POST routes.
export const strictRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
