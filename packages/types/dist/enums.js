"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WaBusinessCategory = exports.ReportPeriodType = exports.WalletTransactionType = exports.PointsLedgerReason = exports.IntegrationSyncStatus = exports.IntegrationConnectionType = exports.SkipReason = exports.TriggerStatus = exports.TriggerType = exports.CampaignLogStatus = exports.CampaignStatus = exports.CustomerSource = exports.TransactionSource = exports.StaffRole = exports.UserRole = exports.SubscriptionStatus = exports.PlanTier = exports.WaVerificationStatus = exports.TenantMode = void 0;
var TenantMode;
(function (TenantMode) {
    TenantMode["NATIVE"] = "native";
    TenantMode["CONNECTED"] = "connected";
})(TenantMode || (exports.TenantMode = TenantMode = {}));
var WaVerificationStatus;
(function (WaVerificationStatus) {
    WaVerificationStatus["PENDING"] = "pending";
    WaVerificationStatus["AWAITING_REPLY"] = "awaiting_reply";
    WaVerificationStatus["VERIFIED"] = "verified";
    WaVerificationStatus["FAILED"] = "failed";
})(WaVerificationStatus || (exports.WaVerificationStatus = WaVerificationStatus = {}));
var PlanTier;
(function (PlanTier) {
    PlanTier["STARTER"] = "starter";
    PlanTier["GROWTH"] = "growth";
    PlanTier["CONNECT"] = "connect";
})(PlanTier || (exports.PlanTier = PlanTier = {}));
var SubscriptionStatus;
(function (SubscriptionStatus) {
    SubscriptionStatus["TRIALING"] = "trialing";
    SubscriptionStatus["ACTIVE"] = "active";
    SubscriptionStatus["PAST_DUE"] = "past_due";
    SubscriptionStatus["SUSPENDED"] = "suspended";
    SubscriptionStatus["CANCELLED"] = "cancelled";
})(SubscriptionStatus || (exports.SubscriptionStatus = SubscriptionStatus = {}));
var UserRole;
(function (UserRole) {
    UserRole["OWNER"] = "owner";
    UserRole["MANAGER"] = "manager";
    UserRole["CASHIER"] = "cashier";
})(UserRole || (exports.UserRole = UserRole = {}));
var StaffRole;
(function (StaffRole) {
    StaffRole["SUPER_ADMIN"] = "super_admin";
    StaffRole["SUPPORT_AGENT"] = "support_agent";
})(StaffRole || (exports.StaffRole = StaffRole = {}));
var TransactionSource;
(function (TransactionSource) {
    TransactionSource["CASHIER_APP"] = "cashier_app";
    TransactionSource["WEBHOOK"] = "webhook";
    TransactionSource["API_PULL"] = "api_pull";
    TransactionSource["FILE_IMPORT"] = "file_import";
})(TransactionSource || (exports.TransactionSource = TransactionSource = {}));
var CustomerSource;
(function (CustomerSource) {
    CustomerSource["QR_REGISTRATION"] = "qr_registration";
    CustomerSource["CSV_IMPORT"] = "csv_import";
    CustomerSource["CONNECTED_SYNC"] = "connected_sync";
})(CustomerSource || (exports.CustomerSource = CustomerSource = {}));
var CampaignStatus;
(function (CampaignStatus) {
    CampaignStatus["DRAFT"] = "draft";
    CampaignStatus["SCHEDULED"] = "scheduled";
    CampaignStatus["SENDING"] = "sending";
    CampaignStatus["SENT"] = "sent";
    CampaignStatus["CANCELLED"] = "cancelled";
})(CampaignStatus || (exports.CampaignStatus = CampaignStatus = {}));
var CampaignLogStatus;
(function (CampaignLogStatus) {
    CampaignLogStatus["QUEUED"] = "queued";
    CampaignLogStatus["SENT"] = "sent";
    CampaignLogStatus["DELIVERED"] = "delivered";
    CampaignLogStatus["READ"] = "read";
    CampaignLogStatus["FAILED"] = "failed";
})(CampaignLogStatus || (exports.CampaignLogStatus = CampaignLogStatus = {}));
var TriggerType;
(function (TriggerType) {
    TriggerType["WELCOME"] = "welcome";
    TriggerType["PURCHASE_CONFIRMATION"] = "purchase_confirmation";
    TriggerType["THRESHOLD_NUDGE"] = "threshold_nudge";
    TriggerType["REWARD_UNLOCKED"] = "reward_unlocked";
    TriggerType["BIRTHDAY"] = "birthday";
    TriggerType["LAPSED_WINBACK"] = "lapsed_winback";
    TriggerType["CAMPAIGN_MESSAGE"] = "campaign_message";
    TriggerType["BALANCE_BOT_REPLY"] = "balance_bot_reply";
    TriggerType["WALLET_LOW_BALANCE"] = "wallet_low_balance";
    TriggerType["WALLET_ZERO"] = "wallet_zero";
})(TriggerType || (exports.TriggerType = TriggerType = {}));
var TriggerStatus;
(function (TriggerStatus) {
    TriggerStatus["SENT"] = "sent";
    TriggerStatus["DELIVERED"] = "delivered";
    TriggerStatus["FAILED"] = "failed";
    TriggerStatus["SKIPPED"] = "skipped";
})(TriggerStatus || (exports.TriggerStatus = TriggerStatus = {}));
var SkipReason;
(function (SkipReason) {
    SkipReason["NOT_OPTED_IN"] = "not_opted_in";
    SkipReason["WALLET_EMPTY"] = "wallet_empty";
    SkipReason["RECENTLY_SENT"] = "recently_sent";
    SkipReason["WA_NOT_CONNECTED"] = "wa_not_connected";
})(SkipReason || (exports.SkipReason = SkipReason = {}));
var IntegrationConnectionType;
(function (IntegrationConnectionType) {
    IntegrationConnectionType["WEBHOOK"] = "webhook";
    IntegrationConnectionType["API_PULL"] = "api_pull";
    IntegrationConnectionType["FILE_EXPORT"] = "file_export";
})(IntegrationConnectionType || (exports.IntegrationConnectionType = IntegrationConnectionType = {}));
var IntegrationSyncStatus;
(function (IntegrationSyncStatus) {
    IntegrationSyncStatus["PENDING"] = "pending";
    IntegrationSyncStatus["ACTIVE"] = "active";
    IntegrationSyncStatus["ERROR"] = "error";
    IntegrationSyncStatus["PAUSED"] = "paused";
})(IntegrationSyncStatus || (exports.IntegrationSyncStatus = IntegrationSyncStatus = {}));
var PointsLedgerReason;
(function (PointsLedgerReason) {
    PointsLedgerReason["PURCHASE"] = "purchase";
    PointsLedgerReason["REDEMPTION"] = "redemption";
    PointsLedgerReason["BIRTHDAY_BONUS"] = "birthday_bonus";
    PointsLedgerReason["ADMIN_ADJUSTMENT"] = "admin_adjustment";
    PointsLedgerReason["IMPORT_SEED"] = "import_seed";
})(PointsLedgerReason || (exports.PointsLedgerReason = PointsLedgerReason = {}));
var WalletTransactionType;
(function (WalletTransactionType) {
    WalletTransactionType["TOPUP"] = "topup";
    WalletTransactionType["DEBIT_BIRTHDAY"] = "debit_birthday";
    WalletTransactionType["DEBIT_LAPSED"] = "debit_lapsed";
    WalletTransactionType["DEBIT_CAMPAIGN"] = "debit_campaign";
    WalletTransactionType["DEBIT_UTILITY_OVERAGE"] = "debit_utility_overage";
    WalletTransactionType["REFUND"] = "refund";
})(WalletTransactionType || (exports.WalletTransactionType = WalletTransactionType = {}));
var ReportPeriodType;
(function (ReportPeriodType) {
    ReportPeriodType["THIS_MONTH"] = "this_month";
    ReportPeriodType["LAST_MONTH"] = "last_month";
    ReportPeriodType["LAST_3_MONTHS"] = "last_3_months";
    ReportPeriodType["LAST_6_MONTHS"] = "last_6_months";
    ReportPeriodType["CUSTOM"] = "custom";
})(ReportPeriodType || (exports.ReportPeriodType = ReportPeriodType = {}));
var WaBusinessCategory;
(function (WaBusinessCategory) {
    WaBusinessCategory["GROCERY_SUPERMARKET"] = "Grocery & Supermarkets";
    WaBusinessCategory["PHARMACY"] = "Pharmacy & Health";
    WaBusinessCategory["FASHION"] = "Fashion & Clothing";
    WaBusinessCategory["ELECTRONICS"] = "Electronics";
    WaBusinessCategory["COSMETICS"] = "Cosmetics & Beauty";
    WaBusinessCategory["BABY_PRODUCTS"] = "Baby Products";
    WaBusinessCategory["RESTAURANT"] = "Restaurant & Food";
    WaBusinessCategory["GENERAL_RETAIL"] = "General Retail";
    WaBusinessCategory["OTHER"] = "Other";
})(WaBusinessCategory || (exports.WaBusinessCategory = WaBusinessCategory = {}));
//# sourceMappingURL=enums.js.map