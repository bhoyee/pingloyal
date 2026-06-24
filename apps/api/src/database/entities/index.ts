// Barrel re-export of all TypeORM entities
// Path: src/database/entities/ → ../../ → src/modules/
export { Tenant } from '../../modules/tenants/entities/tenant.entity';
export { TierConfig } from '../../modules/tenants/entities/tier-config.entity';
export { ProductCategory } from '../../modules/tenants/entities/product-category.entity';
export { User } from '../../modules/auth/entities/user.entity';
export { Customer } from '../../modules/customers/entities/customer.entity';
export { Transaction } from '../../modules/transactions/entities/transaction.entity';
export { PointsLedger } from '../../modules/transactions/entities/points-ledger.entity';
export { Campaign } from '../../modules/campaigns/entities/campaign.entity';
export { CampaignLog } from '../../modules/campaigns/entities/campaign-log.entity';
export { TriggerLog } from '../../modules/triggers/entities/trigger-log.entity';
export { WaTriggerTemplate } from '../../modules/triggers/entities/wa-trigger-template.entity';
export { TemplateRequest } from '../../modules/template-requests/entities/template-request.entity';
export { Integration } from '../../modules/integrations/entities/integration.entity';
export { Subscription } from '../../modules/billing/entities/subscription.entity';
export { WalletTransaction } from '../../modules/billing/entities/wallet-transaction.entity';
export { WebhookEvent } from '../../modules/billing/entities/webhook-event.entity';
export { ReportSnapshot } from '../../modules/reports/entities/report-snapshot.entity';
export { ReportSchedule } from '../../modules/reports/entities/report-schedule.entity';
export { Staff } from '../../modules/staff-auth/entities/staff.entity';
export { SupportTicket } from '../../modules/support/entities/support-ticket.entity';
export { SupportTicketMessage } from '../../modules/support/entities/support-ticket-message.entity';
