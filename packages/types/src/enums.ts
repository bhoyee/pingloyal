export enum TenantMode {
  NATIVE = 'native',
  CONNECTED = 'connected',
}

export enum WaVerificationStatus {
  PENDING = 'pending',
  AWAITING_REPLY = 'awaiting_reply',
  VERIFIED = 'verified',
  FAILED = 'failed',
}

export enum PlanTier {
  STARTER = 'starter',
  GROWTH = 'growth',
  CONNECT = 'connect',
}

export enum SubscriptionStatus {
  TRIALING = 'trialing',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  SUSPENDED = 'suspended',
}

export enum UserRole {
  OWNER = 'owner',
  MANAGER = 'manager',
  CASHIER = 'cashier',
}

export enum TransactionSource {
  CASHIER_APP = 'cashier_app',
  WEBHOOK = 'webhook',
  API_PULL = 'api_pull',
  FILE_IMPORT = 'file_import',
}

export enum CustomerSource {
  QR_REGISTRATION = 'qr_registration',
  CSV_IMPORT = 'csv_import',
  CONNECTED_SYNC = 'connected_sync',
}

export enum CampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  SENDING = 'sending',
  SENT = 'sent',
  CANCELLED = 'cancelled',
}

export enum CampaignLogStatus {
  QUEUED = 'queued',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
}

export enum TriggerType {
  WELCOME = 'welcome',
  PURCHASE_CONFIRMATION = 'purchase_confirmation',
  THRESHOLD_NUDGE = 'threshold_nudge',
  REWARD_UNLOCKED = 'reward_unlocked',
  BIRTHDAY = 'birthday',
  LAPSED_WINBACK = 'lapsed_winback',
  CAMPAIGN_MESSAGE = 'campaign_message',
  BALANCE_BOT_REPLY = 'balance_bot_reply',
  WALLET_LOW_BALANCE = 'wallet_low_balance',
  WALLET_ZERO = 'wallet_zero',
}

export enum TriggerStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export enum SkipReason {
  NOT_OPTED_IN = 'not_opted_in',
  WALLET_EMPTY = 'wallet_empty',
  RECENTLY_SENT = 'recently_sent',
}

export enum IntegrationConnectionType {
  WEBHOOK = 'webhook',
  API_PULL = 'api_pull',
  FILE_EXPORT = 'file_export',
}

export enum IntegrationSyncStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  ERROR = 'error',
  PAUSED = 'paused',
}

export enum PointsLedgerReason {
  PURCHASE = 'purchase',
  REDEMPTION = 'redemption',
  BIRTHDAY_BONUS = 'birthday_bonus',
  ADMIN_ADJUSTMENT = 'admin_adjustment',
  IMPORT_SEED = 'import_seed',
}

export enum WalletTransactionType {
  TOPUP = 'topup',
  DEBIT_BIRTHDAY = 'debit_birthday',
  DEBIT_LAPSED = 'debit_lapsed',
  DEBIT_CAMPAIGN = 'debit_campaign',
  DEBIT_UTILITY_OVERAGE = 'debit_utility_overage',
  REFUND = 'refund',
}

export enum ReportPeriodType {
  THIS_MONTH = 'this_month',
  LAST_MONTH = 'last_month',
  LAST_3_MONTHS = 'last_3_months',
  LAST_6_MONTHS = 'last_6_months',
  CUSTOM = 'custom',
}

export enum WaBusinessCategory {
  GROCERY_SUPERMARKET = 'Grocery & Supermarkets',
  PHARMACY = 'Pharmacy & Health',
  FASHION = 'Fashion & Clothing',
  ELECTRONICS = 'Electronics',
  COSMETICS = 'Cosmetics & Beauty',
  BABY_PRODUCTS = 'Baby Products',
  RESTAURANT = 'Restaurant & Food',
  GENERAL_RETAIL = 'General Retail',
  OTHER = 'Other',
}
