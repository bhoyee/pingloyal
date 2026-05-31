// Named throttle configs — key names must match ThrottlerModule.forRoot names
export const ThrottleConfigs = {
  LOGIN: { login: { ttl: 900_000, limit: 5 } },
  REGISTER_ACCOUNT: { register_account: { ttl: 3_600_000, limit: 10 } },
  CUSTOMER_REG: { customer_reg: { ttl: 60_000, limit: 30 } },
  TENANT_INFO: { tenant_info: { ttl: 60_000, limit: 30 } },
  WEBHOOK_GUPSHUP: { webhook_gupshup: { ttl: 60_000, limit: 500 } },
  WEBHOOK_INTEGRATION: { webhook_integration: { ttl: 60_000, limit: 200 } },
  LOOKUP: { lookup: { ttl: 60_000, limit: 60 } },
  TRANSACTIONS: { transactions: { ttl: 60_000, limit: 120 } },
  DASHBOARD: { dashboard: { ttl: 60_000, limit: 30 } },
  CAMPAIGN_SEND: { campaign_send: { ttl: 60_000, limit: 5 } },
  DEFAULT_AUTH: { default: { ttl: 60_000, limit: 100 } },
} as const;
