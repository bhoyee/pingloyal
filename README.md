# PingLoyal

WhatsApp loyalty automation SaaS for Nigerian retail SMBs.

## Stack

| Layer | Technology |
|---|---|
| Backend | NestJS 11 + TypeScript 5 + TypeORM 0.3 + PostgreSQL 16 |
| Queue | BullMQ + Redis 7 |
| Frontend | Next.js 16 App Router + Tailwind + shadcn/ui |
| Auth | Passport.js + JWT RS256 (15min access / 30day refresh) |
| Payments | Paystack (Nigeria) + Stripe (UK) |
| WhatsApp | Gupshup BSP — Partner API |
| Infra | VPS Ubuntu 22.04 + Docker Compose |
| Storage | Cloudflare R2 |

## Monorepo Structure

```
pingloyal/
  apps/
    api/          → NestJS backend
    web/          → Next.js frontend
  packages/
    types/        → Shared TypeScript interfaces and enums
    utils/        → Phone normalisation, encryption helpers
    zod-schemas/  → Shared Zod validation schemas
```

## Local Development

### Prerequisites

- Node.js ≥ 20
- Docker + Docker Compose
- An `.env` file — copy `.env.example` and fill in values

### Start external services

```bash
docker compose up -d   # PostgreSQL + Redis + Redis Commander
```

### Run the API

```bash
npm run dev:api        # NestJS watch mode on port 3000
```

### Run database migrations

```bash
cd apps/api && npm run migration:run
```

## Testing

```bash
# Unit tests (scaffolded — expands with each module prompt)
npm run test:unit

# Integration tests — requires Docker services running
npm run test:integration

# E2E tests
npm run test:e2e

# Type-check all workspaces
npm run type-check
```

## CI / CD

### Pipeline

```
feature/prompt-N-... → PR to develop → CI runs → merge
develop              → PR to main    → CI runs → merge → deploy triggers
```

**CI jobs** (`.github/workflows/ci.yml`):
1. `lint` — ESLint + TypeScript type-check
2. `unit-tests` — Jest unit tests + coverage (parallel with integration)
3. `integration-tests` — Real PostgreSQL + Redis, migrations, isolation tests
4. `e2e-tests` — Runs after unit + integration both pass

**Deploy jobs** (`.github/workflows/deploy.yml`):
1. `deploy-api` — SSH to VPS, Docker rebuild, migrate, health check
2. `deploy-web` — Next.js build, SCP to VPS, PM2 restart

---

## GitHub Secrets Required

Configure at **Settings → Secrets and variables → Actions**.

### For CI (integration + e2e tests)

| Secret | Description |
|---|---|
| `TEST_JWT_PRIVATE_KEY` | RSA private key, base64-encoded PEM (generate a test-only pair) |
| `TEST_JWT_PUBLIC_KEY` | RSA public key, base64-encoded PEM (must match private key above) |
| `TEST_ENCRYPTION_KEY` | 64-character hex string (32 bytes for AES-256-GCM) |

**Generate test key pair:**
```bash
openssl genrsa -out test_private.pem 2048
openssl rsa -in test_private.pem -pubout -out test_public.pem
base64 -w 0 test_private.pem   # → TEST_JWT_PRIVATE_KEY
base64 -w 0 test_public.pem    # → TEST_JWT_PUBLIC_KEY
openssl rand -hex 32           # → TEST_ENCRYPTION_KEY
```

### For deployment

| Secret | Description |
|---|---|
| `VPS_HOST` | IP address of the Hetzner VPS |
| `VPS_USER` | SSH username (e.g. `deploy`) |
| `SSH_PRIVATE_KEY` | Full PEM content of the private SSH key |
| `PRODUCTION_API_URL` | `https://api.pingloyal.com` |

### Production environment variables (on VPS only)

Set these in `/opt/pingloyal/.env.production` on the server — **NOT** as GitHub Secrets:

```
DATABASE_URL
REDIS_URL
JWT_PRIVATE_KEY
JWT_PUBLIC_KEY
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
ENCRYPTION_KEY
GUPSHUP_PARTNER_KEY
GUPSHUP_PARTNER_ID
GUPSHUP_PARTNER_API_URL
GUPSHUP_API_URL
WA_APP_SECRET
PAYSTACK_SECRET_KEY
R2_BUCKET
R2_ACCOUNT_ID
R2_ACCESS_KEY
R2_SECRET_KEY
RESEND_API_KEY
FRONTEND_URL
SENTRY_DSN
NODE_ENV=production
LOG_LEVEL=info
```

---

## Branch Protection (recommended)

Configure on GitHub for both `develop` and `main`:

- Require status checks: `lint`, `unit-tests`, `integration-tests`, `e2e-tests`
- Require branches to be up to date before merging
- Require CODEOWNER review (`.github/CODEOWNERS`)
- Disallow force pushes
- `main` additionally: require approval from 1 reviewer before merging from `develop`
