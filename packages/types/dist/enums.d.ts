export declare enum TenantMode {
    NATIVE = "native",
    CONNECTED = "connected"
}
export declare enum WaVerificationStatus {
    PENDING = "pending",
    AWAITING_REPLY = "awaiting_reply",
    VERIFIED = "verified",
    FAILED = "failed"
}
export declare enum PlanTier {
    STARTER = "starter",
    GROWTH = "growth",
    CONNECT = "connect"
}
export declare enum SubscriptionStatus {
    TRIALING = "trialing",
    ACTIVE = "active",
    PAST_DUE = "past_due",
    SUSPENDED = "suspended",
    CANCELLED = "cancelled"
}
export declare enum UserRole {
    OWNER = "owner",
    MANAGER = "manager",
    CASHIER = "cashier"
}
export declare enum StaffRole {
    SUPER_ADMIN = "super_admin",
    SUPPORT_AGENT = "support_agent"
}
export declare enum TransactionSource {
    CASHIER_APP = "cashier_app",
    WEBHOOK = "webhook",
    API_PULL = "api_pull",
    FILE_IMPORT = "file_import"
}
export declare enum CustomerSource {
    QR_REGISTRATION = "qr_registration",
    CSV_IMPORT = "csv_import",
    CONNECTED_SYNC = "connected_sync"
}
export declare enum CampaignStatus {
    DRAFT = "draft",
    SCHEDULED = "scheduled",
    SENDING = "sending",
    SENT = "sent",
    CANCELLED = "cancelled"
}
export declare enum CampaignLogStatus {
    QUEUED = "queued",
    SENT = "sent",
    DELIVERED = "delivered",
    READ = "read",
    FAILED = "failed"
}
export declare enum TriggerType {
    WELCOME = "welcome",
    PURCHASE_CONFIRMATION = "purchase_confirmation",
    THRESHOLD_NUDGE = "threshold_nudge",
    REWARD_UNLOCKED = "reward_unlocked",
    BIRTHDAY = "birthday",
    LAPSED_WINBACK = "lapsed_winback",
    CAMPAIGN_MESSAGE = "campaign_message",
    BALANCE_BOT_REPLY = "balance_bot_reply",
    WALLET_LOW_BALANCE = "wallet_low_balance",
    WALLET_ZERO = "wallet_zero",
    REWARD_REDEEMED = "reward_redeemed"
}
export declare enum TriggerStatus {
    SENT = "sent",
    DELIVERED = "delivered",
    FAILED = "failed",
    SKIPPED = "skipped"
}
export declare enum SkipReason {
    NOT_OPTED_IN = "not_opted_in",
    WALLET_EMPTY = "wallet_empty",
    RECENTLY_SENT = "recently_sent",
    WA_NOT_CONNECTED = "wa_not_connected"
}
export declare enum IntegrationConnectionType {
    WEBHOOK = "webhook",
    API_PULL = "api_pull",
    FILE_EXPORT = "file_export"
}
export declare enum IntegrationSyncStatus {
    PENDING = "pending",
    ACTIVE = "active",
    ERROR = "error",
    PAUSED = "paused"
}
export declare enum PointsLedgerReason {
    PURCHASE = "purchase",
    REDEMPTION = "redemption",
    BIRTHDAY_BONUS = "birthday_bonus",
    ADMIN_ADJUSTMENT = "admin_adjustment",
    IMPORT_SEED = "import_seed",
    VOID = "void"
}
export declare enum WalletTransactionType {
    TOPUP = "topup",
    DEBIT_BIRTHDAY = "debit_birthday",
    DEBIT_LAPSED = "debit_lapsed",
    DEBIT_CAMPAIGN = "debit_campaign",
    DEBIT_UTILITY_OVERAGE = "debit_utility_overage",
    REFUND = "refund"
}
export declare enum ReportPeriodType {
    THIS_MONTH = "this_month",
    LAST_MONTH = "last_month",
    LAST_3_MONTHS = "last_3_months",
    LAST_6_MONTHS = "last_6_months",
    CUSTOM = "custom"
}
export declare enum WaBusinessCategory {
    GROCERY_SUPERMARKET = "Grocery & Supermarkets",
    PHARMACY = "Pharmacy & Health",
    FASHION = "Fashion & Clothing",
    ELECTRONICS = "Electronics",
    COSMETICS = "Cosmetics & Beauty",
    BABY_PRODUCTS = "Baby Products",
    RESTAURANT = "Restaurant & Food",
    GENERAL_RETAIL = "General Retail",
    OTHER = "Other"
}
//# sourceMappingURL=enums.d.ts.map