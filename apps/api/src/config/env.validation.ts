import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // ── Database ──────────────────────────────────────────────────────────────
  DATABASE_URL: Joi.string().uri().required(),

  // ── Redis ─────────────────────────────────────────────────────────────────
  REDIS_URL: Joi.string().uri().required(),

  // ── JWT RS256 key pair ────────────────────────────────────────────────────
  JWT_PRIVATE_KEY: Joi.string().required(),
  JWT_PUBLIC_KEY: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().required().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().required().default('30d'),

  // ── Encryption — exactly 64 hex chars = 32-byte AES-256-GCM key ───────────
  ENCRYPTION_KEY: Joi.string().length(64).required(),

  // ── Gupshup BSP ───────────────────────────────────────────────────────────
  GUPSHUP_PARTNER_KEY: Joi.string().required(),
  GUPSHUP_PARTNER_ID: Joi.string().required(),
  GUPSHUP_PARTNER_API_URL: Joi.string().uri().required(),
  GUPSHUP_API_URL: Joi.string().uri().required(),
  WA_APP_SECRET: Joi.string().required(),

  // ── Payments ──────────────────────────────────────────────────────────────
  PAYSTACK_SECRET_KEY: Joi.string().required(),
  STRIPE_SECRET_KEY: Joi.string().allow('').optional(),
  STRIPE_WEBHOOK_SECRET: Joi.string().allow('').optional(),

  // ── Cloudflare R2 ─────────────────────────────────────────────────────────
  R2_BUCKET: Joi.string().required(),
  R2_ACCOUNT_ID: Joi.string().required(),
  R2_ACCESS_KEY: Joi.string().required(),
  R2_SECRET_KEY: Joi.string().required(),

  // ── Email ─────────────────────────────────────────────────────────────────
  RESEND_API_KEY: Joi.string().required(),

  // ── App ───────────────────────────────────────────────────────────────────
  NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),
  PORT: Joi.number().default(3000),
  FRONTEND_URL: Joi.string().uri().required(),

  // ── Queue dashboard ───────────────────────────────────────────────────────
  ADMIN_QUEUE_USER: Joi.string().required(),
  ADMIN_QUEUE_PASS: Joi.string().min(8).required(),

  // ── Optional ──────────────────────────────────────────────────────────────
  PAYSTACK_PLAN_STARTER_NGN: Joi.string().allow('').optional(),
  PAYSTACK_PLAN_GROWTH_NGN: Joi.string().allow('').optional(),
  PAYSTACK_PLAN_CONNECT_NGN: Joi.string().allow('').optional(),
  STRIPE_PRICE_STARTER_GBP: Joi.string().allow('').optional(),
  STRIPE_PRICE_GROWTH_GBP: Joi.string().allow('').optional(),
  STRIPE_PRICE_CONNECT_GBP: Joi.string().allow('').optional(),
  SENTRY_DSN: Joi.string().uri().allow('').optional(),
  LOG_LEVEL: Joi.string()
    .valid('debug', 'info', 'warn', 'error')
    .default('info'),
}).options({ allowUnknown: true });
