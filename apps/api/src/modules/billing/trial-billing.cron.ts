import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import type { PlanId } from './plans.config';
import { BillingService } from './billing.service';

interface DueChargeRow {
  tenant_id: string;
  subscription_id: string;
  plan_tier: string;
  currency: string;
  amount: string;
  paystack_authorization_code: string;
  owner_email: string;
}

interface PendingTenantRow {
  tenant_id: string;
}

interface PastDueChargeRow extends DueChargeRow {
  trial_charge_attempts: number;
  grace_period_started_at: string;
}

const MAX_DUNNING_ATTEMPTS = 3;
const GRACE_WINDOW_DAYS = 6;
const RETRY_COOLDOWN_HOURS = 20;

@Injectable()
export class TrialBillingCronService {
  private readonly logger = new Logger(TrialBillingCronService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly billingService: BillingService,
  ) {}

  // Stripe trials convert and retry entirely through Stripe's own billing
  // engine (subscription_data.trial_period_days + its native invoice
  // retries) — webhooks already drive activation/past_due for that path.
  // Paystack has no equivalent, so this cron does the day-14 charge attempt
  // for NGN tenants only.
  @Cron('0 * * * *')
  async chargeExpiredPaystackTrials(): Promise<void> {
    const due: DueChargeRow[] = await this.dataSource.query(
      `SELECT s.tenant_id, s.id AS subscription_id, s.plan_tier, t.currency,
              s.amount, s.paystack_authorization_code, u.email AS owner_email
       FROM subscriptions s
       JOIN tenants t ON t.id = s.tenant_id
       JOIN users u ON u.tenant_id = t.id AND u.role = 'owner'
       WHERE s.status = 'trialing'
         AND t.currency = 'NGN'
         AND t.trial_ends_at <= NOW()
         AND s.cancel_at_period_end = false
         AND s.paystack_authorization_code IS NOT NULL`,
    );

    for (const row of due) {
      try {
        await this.billingService.attemptPaystackCharge({
          tenantId: row.tenant_id,
          subscriptionId: row.subscription_id,
          planId: `${row.plan_tier}_ngn` as PlanId,
          authorizationCode: row.paystack_authorization_code,
          amount: Number(row.amount),
          ownerEmail: row.owner_email,
        });
      } catch (err) {
        this.logger.error(
          `Day-14 charge attempt failed for tenant ${row.tenant_id}: ${String(err)}`,
        );
      }
    }
    if (due.length > 0) {
      this.logger.log(
        `Day-14 trial conversion: attempted ${due.length} charge(s)`,
      );
    }

    // Trials cancelled before conversion, now past their original end date —
    // never charged, just marked cancelled.
    const cancelled: PendingTenantRow[] = await this.dataSource.query(
      `SELECT s.tenant_id
       FROM subscriptions s
       JOIN tenants t ON t.id = s.tenant_id
       WHERE s.status = 'trialing'
         AND t.currency = 'NGN'
         AND t.trial_ends_at <= NOW()
         AND s.cancel_at_period_end = true`,
    );
    for (const row of cancelled) {
      try {
        await this.billingService.cancelTenant(row.tenant_id);
      } catch (err) {
        this.logger.error(
          `Failed to cancel expired trial for tenant ${row.tenant_id}: ${String(err)}`,
        );
      }
    }

    // Defensive: trial expired but the card verification webhook never
    // landed (no authorization code at all) — there's nothing to charge.
    // Suspend rather than leaving these trialing indefinitely.
    const stuck: PendingTenantRow[] = await this.dataSource.query(
      `SELECT s.tenant_id
       FROM subscriptions s
       JOIN tenants t ON t.id = s.tenant_id
       WHERE s.status = 'trialing'
         AND t.currency = 'NGN'
         AND t.trial_ends_at <= NOW()
         AND s.cancel_at_period_end = false
         AND s.paystack_authorization_code IS NULL`,
    );
    for (const row of stuck) {
      try {
        await this.billingService.suspendTenant(row.tenant_id);
        this.logger.warn(
          `Suspended tenant ${row.tenant_id}: trial expired with no payment authorization on file`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to suspend stuck trial for tenant ${row.tenant_id}: ${String(err)}`,
        );
      }
    }
  }

  // Retries failed Paystack charges for a bounded window, then suspends.
  // Also covers Stripe tenants stuck past_due past the same window as a
  // safety net in case a customer.subscription.deleted webhook was missed —
  // Stripe's own retry/dunning still does the actual retrying for that side.
  @Cron('0 2 * * *')
  async retryFailedPaystackCharges(): Promise<void> {
    const pastDue: PastDueChargeRow[] = await this.dataSource.query(
      `SELECT s.tenant_id, s.id AS subscription_id, s.plan_tier, t.currency,
              s.amount, s.paystack_authorization_code, u.email AS owner_email,
              s.trial_charge_attempts, s.grace_period_started_at
       FROM subscriptions s
       JOIN tenants t ON t.id = s.tenant_id
       JOIN users u ON u.tenant_id = t.id AND u.role = 'owner'
       WHERE s.status = 'past_due'
         AND t.currency = 'NGN'
         AND s.paystack_authorization_code IS NOT NULL
         AND (s.last_charge_attempt_at IS NULL
              OR s.last_charge_attempt_at < NOW() - INTERVAL '${RETRY_COOLDOWN_HOURS} hours')`,
    );

    for (const row of pastDue) {
      try {
        const graceAgeDays = row.grace_period_started_at
          ? (Date.now() - new Date(row.grace_period_started_at).getTime()) /
            86_400_000
          : 0;

        if (
          row.trial_charge_attempts >= MAX_DUNNING_ATTEMPTS ||
          graceAgeDays >= GRACE_WINDOW_DAYS
        ) {
          await this.billingService.suspendTenant(row.tenant_id);
          this.logger.log(
            `Suspended tenant ${row.tenant_id} after dunning: attempts=${row.trial_charge_attempts} graceAgeDays=${graceAgeDays.toFixed(1)}`,
          );
          continue;
        }

        await this.billingService.attemptPaystackCharge({
          tenantId: row.tenant_id,
          subscriptionId: row.subscription_id,
          planId: `${row.plan_tier}_ngn` as PlanId,
          authorizationCode: row.paystack_authorization_code,
          amount: Number(row.amount),
          ownerEmail: row.owner_email,
        });
      } catch (err) {
        this.logger.error(
          `Dunning retry failed for tenant ${row.tenant_id}: ${String(err)}`,
        );
      }
    }

    // Stripe safety net — defends against a missed/delayed webhook leaving
    // a tenant past_due indefinitely instead of resolving to suspended.
    const stuckStripe: PendingTenantRow[] = await this.dataSource.query(
      `SELECT s.tenant_id
       FROM subscriptions s
       WHERE s.status = 'past_due'
         AND s.currency = 'GBP'
         AND s.grace_period_started_at < NOW() - INTERVAL '${GRACE_WINDOW_DAYS} days'`,
    );
    for (const row of stuckStripe) {
      try {
        await this.billingService.suspendTenant(row.tenant_id);
        this.logger.warn(
          `Suspended Stripe tenant ${row.tenant_id}: past_due past grace window with no resolving webhook`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to suspend stuck Stripe tenant ${row.tenant_id}: ${String(err)}`,
        );
      }
    }
  }
}
