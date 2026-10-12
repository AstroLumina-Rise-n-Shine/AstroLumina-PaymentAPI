# AstroLumina Payment API

Stripe Embedded Checkout for the AstroLumina astrological services platform.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5.x-green.svg)](https://expressjs.com/)
[![Node](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![Stripe](https://img.shields.io/badge/Stripe-17.x-purple.svg)](https://stripe.com/)
![Sentry](https://img.shields.io/badge/Sentry-10.x-362d59?style=flat&logo=sentry)
![Docker](https://img.shields.io/badge/Docker-25.0-2496ed?style=flat&logo=docker)
![CI/CD](https://img.shields.io/badge/GitHub_Actions-2088ff?style=flat&logo=githubactions)

---

## Features

- **Stripe Embedded Checkout** — seamless payment flow without redirect
- **Product catalog** — 6 astrological services and event products with configurable price IDs
- **Session status tracking** — query checkout session status after payment
- **Stateless design** — no database, no persistent state — pure Stripe proxy
- **Zod validation** — input validation at every endpoint with type-safe schemas
- **Environment validation** — app fails fast with clear errors if config is invalid
- **Sentry monitoring** — error tracking + CPU profiling

### Available Products

| Product Key                    | Description                        |
| ------------------------------ | ---------------------------------- |
| `soarele-stralucirea-ta`       | Soarele Stralucirea Ta             |
| `ghid-saturn-in-berbec`        | Ghid complet Saturn in Berbec      |
| `astrograma-natala-si-karmica` | Astrograma natala si karmica       |
| `astrograma-relationala`       | Astrograma relationala             |
| `astrograma-previzionala`      | Astrograma previzionala            |
| `eveniment-constelatii`        | Eveniment constelatii              |

---

## Security

| Feature           | Implementation                                              |
| ----------------- | ----------------------------------------------------------- |
| **HTTP Headers**  | Helmet (CSP, HSTS, X-Frame-Options, etc.)                   |
| **Rate Limiting** | 30 requests/minute per IP                                   |
| **CORS**          | Dynamic whitelist built from `*_SERVER_DC_PORT` / `*_SERVER_DC_DNS` and `*_SERVER_K8S_PORT` / `*_SERVER_K8S_DNS` env vars (Astrology, Booking, Payment, Frontend services) over `http` + `https` on `localhost`, `192.168.122.10-12` and each service DNS + Cloudflare Pages domains (`astrolumina.pages.dev`, `develop.astrolumina.pages.dev`, `astrolumina.com`, `astrolumina.ro`). Override via `CORS_ORIGINS`. |
| **Request Size**  | Max 1MB body (returns `413` if exceeded)                    |
| **PII Scrubbing** | Sentry automatically redacts Stripe keys from error reports |
| **Input Validation** | Zod schemas on all endpoint inputs                       |
| **Environment Validation** | Zod-validated env.ts — app refuses to start with missing required vars |

---

## Tech Stack

| Layer      | Technology                          |
| ---------- | ----------------------------------- |
| **Runtime**    | Node.js 22.x                        |
| **Language**   | TypeScript 5.8 (strict mode, ESM)   |
| **Framework**  | Express 5.x                         |
| **Payments**   | Stripe Embedded Checkout 17.x       |
| **Validation** | Zod                                 |
| **Monitoring** | Sentry 10.x (with profiling)        |
| **Security**   | Helmet, CORS, Rate Limiting         |
| **Container**  | Docker, Docker Compose              |
| **CI/CD**      | GitHub Actions                      |

---

## Project Structure

```
.
├── .github/
│   └── workflows/           # CI/CD pipelines
│       └── build-deploy.yml  # Docker image build & push
├── src/
│   ├── server.ts            # Express entry point + graceful shutdown
│   ├── instrument.ts        # Sentry initialization (imported first)
│   ├── config/
│   │   └── env.ts           # Zod-based environment validation
│   ├── middleware/
│   │   ├── security.ts      # Helmet, CORS, rate limiter
│   │   └── error-handler.ts # Error types and handlers
│   ├── routes/
│   │   ├── checkout.ts      # Stripe checkout endpoints
│   │   └── health.ts        # Health check
│   └── types/
│       └── products.ts      # Product catalog
├── dist/                    # Compiled output (gitignored)
├── docker-compose.yml       # Single-service deployment
├── Dockerfile               # Multi-stage build
├── VERSION.json             # Version config
├── .dockerignore
├── .env.example             # Environment variables template (not committed)
├── tsconfig.json
└── package.json
```

---

## Architecture

The PaymentAPI is a **stateless microservice** that acts as a proxy between the frontend and Stripe:

```
┌──────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│              (Embedded Checkout UI)                      │
└────────────────────────┬─────────────────────────────────┘
                         │ POST /create-checkout-session/:product
                         ▼
┌──────────────────────────────────────────────────────────┐
│              PaymentAPI (1 replica)                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐ │
│  │  Security  │→ │  Routes    │→ │  Stripe API        │ │
│  │  (Helmet,  │  │  (Zod      │  │  (Embedded         │ │
│  │  CORS,     │  │  validate) │  │   Checkout)        │ │
│  │  Rate Lim) │  └────────────┘  └────────────────────┘ │
│  └────────────┘        │                                │
│                        ▼                                │
│                 Return clientSecret                     │
│                 (stateless — no DB)                     │
│                                                         │
│  • healthcheck: /health every 30s                      │
│  • resources: 0.125–1 CPU, 128M–1G RAM                 │
│  • Sentry error tracking + profiling                   │
│  • Stripe keys scrubbed from error reports             │
└──────────────────────────────────────────────────────────┘
```

---

## Environment Variables

| Variable                              | Required | Default             | Description                                       |
| ------------------------------------- | -------- | ------------------- | ------------------------------------------------- |
| `NODE_ENV`                            | Yes      | —                   | `development`, `staging`, or `production`         |
| `PAYMENT_API_SERVER_PORT`             | Yes      | —                   | Payment API listen port (local process and inside the container) |
| `PAYMENT_API_SENTRY_DSN`              | Yes      | —                   | Sentry DSN for error tracking                     |
| `CORS_ORIGINS`                        | No       | _(dynamic defaults)_ | Comma-separated allowed origins; when omitted, defaults are built from the `*_SERVER_DC_PORT` / `*_SERVER_DC_DNS` and `*_SERVER_K8S_PORT` / `*_SERVER_K8S_DNS` variables above plus Cloudflare Pages domains |
| `STRIPE_SK`                           | Yes      | —                   | Stripe secret key                                 |
| `STRIPE_API_VER`                      | Yes      | —                   | Stripe API version                                |
| `STRIPE_SOARELE_STRALUCIREA_TA`       | Yes      | —                   | Price ID for Soarele Stralucirea Ta               |
| `STRIPE_GHID_SATURN_IN_BERBEC`        | Yes      | —                   | Price ID for Ghid Saturn in Berbec                |
| `STRIPE_ASTROGRAMA_NATALA_SI_KARMICA` | Yes      | —                   | Price ID for Astrograma Natala si Karmica         |
| `STRIPE_ASTROGRAMA_RELATIONALA`       | Yes      | —                   | Price ID for Astrograma Relationala               |
| `STRIPE_ASTROGRAMA_PREVIZIONALA`      | Yes      | —                   | Price ID for Astrograma Previzionala              |
| `STRIPE_EVENIMENT_CONSTELATII`        | Yes      | —                   | Price ID for Eveniment Constelatii                |
| `ASTROLOGY_API_SERVER_DC_PORT`        | Yes      | —                   | Astrology API port in Docker Compose (for CORS)   |
| `ASTROLOGY_API_SERVER_DC_DNS`         | Yes      | —                   | Astrology API DNS/hostname in Docker Compose (for CORS) |
| `ASTROLOGY_API_SERVER_K8S_PORT`       | Yes      | —                   | Astrology API port in Kubernetes (for CORS)       |
| `ASTROLOGY_API_SERVER_K8S_DNS`        | Yes      | —                   | Astrology API DNS/hostname in Kubernetes (for CORS) |
| `BOOKING_API_SERVER_DC_PORT`          | Yes      | —                   | Booking API port in Docker Compose (for CORS)     |
| `BOOKING_API_SERVER_DC_DNS`           | Yes      | —                   | Booking API DNS/hostname in Docker Compose (for CORS) |
| `BOOKING_API_SERVER_K8S_PORT`         | Yes      | —                   | Booking API port in Kubernetes (for CORS)         |
| `BOOKING_API_SERVER_K8S_DNS`          | Yes      | —                   | Booking API DNS/hostname in Kubernetes (for CORS) |
| `PAYMENT_API_SERVER_DC_PORT`          | Yes      | —                   | Public port mapped to the app port in Docker Compose |
| `PAYMENT_API_SERVER_DC_DNS`           | Yes      | —                   | Payment service DNS/hostname in Docker Compose    |
| `PAYMENT_API_SERVER_K8S_PORT`         | Yes      | —                   | Public port mapped to the app port in Kubernetes  |
| `PAYMENT_API_SERVER_K8S_DNS`          | Yes      | —                   | Payment service DNS/hostname in Kubernetes        |
| `FRONTEND_SERVER_DC_PORT`             | Yes      | —                   | Frontend port in Docker Compose (for CORS)        |
| `FRONTEND_SERVER_DC_DNS`              | Yes      | —                   | Frontend DNS/hostname in Docker Compose (for CORS) |
| `FRONTEND_SERVER_K8S_PORT`            | Yes      | —                   | Frontend port in Kubernetes (for CORS)            |
| `FRONTEND_SERVER_K8S_DNS`             | Yes      | —                   | Frontend DNS/hostname in Kubernetes (for CORS)    |

---

## Deployment

### Docker Compose

```bash
# Build and start the service
docker compose up -d

# View logs
docker compose logs -f payment-api

# Stop services
docker compose down
```

### Manual Docker Build

```bash
# Build image
docker build -t astrolumina-payment-api:latest .

# Run container
docker run -p <PORT>:<PORT> --env-file .env astrolumina-payment-api:latest
```

### Render

```text
Build Command:  npm run render-build
Start Command:  npm start
Node Version:    22.x
```

### Image Registry

Images are automatically built and pushed to GitHub Container Registry:

```
ghcr.io/astrolumina-rise-n-shine/astrolumina-paymentapi:latest
ghcr.io/astrolumina-rise-n-shine/astrolumina-paymentapi:v1.0.0
```

### CI/CD Pipeline

Triggered on **PR merge to `main`**:

1. **Auto-version** — Reads `VERSION.json` for major/minor, increments patch, creates and pushes a git tag
2. **Docker build** — Builds image from the new tag and pushes to GitHub Container Registry

### Local Development

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env   # then edit with your Stripe keys

# Development (auto-reload)
npm run dev

# Production
npm run build
npm start
```

Server runs on `http://localhost:<PORT>` (configured via `PAYMENT_API_SERVER_PORT`).

---

## Endpoints

### `GET /health`

Returns server status, uptime, memory usage, Node version, and environment.

### `GET /metrics`

Prometheus exposition endpoint (plain text). Serves Node.js default metrics
plus `http_requests_total` and `http_request_duration_seconds`, all labeled
with `service`. Scraped in-cluster via the `ServiceMonitor`s in the
AstroLumina-Monitoring repo; not exposed through Traefik.

### `POST /create-checkout-session/:product`

Creates a Stripe Embedded Checkout session. The `:product` parameter selects which service to charge for.

**Optional body parameters:**

| Field         | Type   | Default | Description                                |
| ------------- | ------ | ------- | ------------------------------------------ |
| `ticketCount` | number | `1`     | Number of tickets (used for event products)|
| `eventId`     | string | —       | Event identifier (optional metadata)       |

**Example:**

```bash
curl -X POST http://localhost:<PORT>/create-checkout-session/astrograma-natala-si-karmica \
  -H "Content-Type: application/json"
```

**Response:**

```json
{
  "clientSecret": "cs_test_..."
}
```

### `GET /session-status?session_id={ID}`

Retrieves the status of a checkout session.

### `GET /products`

Lists all available products with their keys, names, and descriptions.

### Error Responses

| Status Code | Meaning |
| ----------- | ------- |
| `400` | Invalid input (missing or malformed parameters, unknown product) |
| `404` | Route not found |
| `413` | Request payload too large (>1MB) |
| `429` | Rate limit exceeded |
| `500` | Internal server error (Stripe API failure, unexpected errors) |

In non-production modes (`development`, `staging`), error responses include the stack trace for debugging.

---

## Part of AstroLumina

| Service       | Repository                 |
| ------------- | -------------------------- |
| Payment API   | `AstroLumina-PaymentAPI`   |
| Astrology API | `AstroLumina-AstrologyAPI` |
| Frontend      | `AstroLumina-Frontend`     |
| Booking API   | `AstroLumina-BookingAPI`   |

---

## License

Proprietary — AstroLumina
