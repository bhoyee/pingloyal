import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { DateTime } from 'luxon';
import { decrypt, isTriggerEnabled, maskPhone } from '@pingloyal/utils';
import {
  TriggerStatus,
  TriggerType,
  WaVerificationStatus,
} from '@pingloyal/types';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Customer } from '../customers/entities/customer.entity';
import { TierConfig } from '../tenants/entities/tier-config.entity';
import { TriggerLog } from '../triggers/entities/trigger-log.entity';

interface HandleInboundParams {
  appId: string;
  senderPhone: string;
  messageText: string;
}

interface GupshupSessionResponse {
  status: string;
  messageId?: string;
}

@Injectable()
export class WaBotService {
  private readonly logger = new Logger(WaBotService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(TierConfig)
    private readonly tierConfigRepo: Repository<TierConfig>,
    @InjectRepository(TriggerLog)
    private readonly triggerLogRepo: Repository<TriggerLog>,
    private readonly config: ConfigService,
  ) {}

  async handleInbound({
    appId,
    senderPhone,
    messageText,
  }: HandleInboundParams): Promise<void> {
    // Step 1 — Find tenant by Gupshup App ID
    const tenant = await this.tenantRepo.findOne({
      where: { gupshupAppId: appId },
    });

    if (!tenant) {
      this.logger.warn(`WaBot: unknown Gupshup appId=${appId} — ignoring`);
      return;
    }

    if (tenant.waVerificationStatus !== WaVerificationStatus.VERIFIED) {
      return;
    }

    // Step 2 — Find customer by phone
    const customer = await this.customerRepo.findOne({
      where: { tenantId: tenant.id, phoneE164: senderPhone },
    });

    if (!customer) {
      const regMsg =
        `Hi! 👋 You are not yet registered in the ${tenant.businessName} loyalty` +
        ` programme. Ask at the till to join and start earning points on every purchase!`;
      await this.sendSessionMessage(tenant, senderPhone, regMsg);
      await this.logBotReply(tenant.id, null, TriggerStatus.SENT, null);
      return;
    }

    // Handle STOP command
    const text = messageText.trim().toLowerCase();
    if (text.includes('stop')) {
      await this.customerRepo.update(customer.id, { waOptedIn: false });
      const stopMsg =
        `You have been unsubscribed from ${tenant.businessName} WhatsApp messages.` +
        ` Reply START at any time to re-subscribe.`;
      await this.sendSessionMessage(tenant, senderPhone, stopMsg);
      await this.logBotReply(tenant.id, customer.id, TriggerStatus.SENT, null);
      return;
    }

    // Handle redeem keyword — inform the customer how many rewards they can claim
    const REDEEM_KEYWORDS = [
      'redeem',
      'reward',
      'voucher',
      'redeem points',
      'use points',
      'claim reward',
    ];
    if (REDEEM_KEYWORDS.some((kw) => text.includes(kw))) {
      const currencySymbol = tenant.currency === 'GBP' ? '£' : '₦';
      const rewardsAvailable = Math.floor(
        customer.pointsBalance / tenant.pointsThreshold,
      );

      let redeemMsg: string;
      if (rewardsAvailable === 0) {
        const pointsNeeded = tenant.pointsThreshold - customer.pointsBalance;
        redeemMsg =
          `Hi ${customer.fullName.split(' ')[0]}! 👋 You need *${pointsNeeded.toLocaleString()} more points*` +
          ` to unlock a ${currencySymbol}${tenant.rewardValue} reward.\n\n` +
          `Your current balance: *${customer.pointsBalance.toLocaleString()} pts*`;
      } else if (rewardsAvailable === 1) {
        redeemMsg =
          `Hi ${customer.fullName.split(' ')[0]}! 🎁 You have *1 reward available* worth` +
          ` *${currencySymbol}${tenant.rewardValue.toLocaleString()}*.\n\n` +
          `Show this message at the till and ask the cashier to apply your reward!`;
      } else {
        const totalValue = rewardsAvailable * Number(tenant.rewardValue);
        redeemMsg =
          `Hi ${customer.fullName.split(' ')[0]}! 🎁 You have *${rewardsAvailable} rewards available*` +
          ` worth *${currencySymbol}${totalValue.toLocaleString()}* total.\n\n` +
          `Show this message at the till and ask the cashier to apply your rewards!`;
      }

      const result = await this.sendSessionMessage(tenant, senderPhone, redeemMsg);
      await this.logBotReply(
        tenant.id,
        customer.id,
        result.success ? TriggerStatus.SENT : TriggerStatus.FAILED,
        result.messageId ?? null,
      );
      return;
    }

    if (
      !isTriggerEnabled(tenant.enabledTriggers, TriggerType.BALANCE_BOT_REPLY)
    ) {
      return;
    }

    // Step 3 — Build balance summary
    const firstName = customer.fullName.split(' ')[0];
    const currencySymbol = tenant.currency === 'GBP' ? '£' : '₦';

    const tierLabel = customer.tierId
      ? await this.getTierLabel(customer.tierId, tenant.id)
      : 'Not yet assigned';

    const pointsToGoal = Math.max(
      0,
      tenant.pointsThreshold - customer.pointsBalance,
    );
    const rawAmountToGoal = pointsToGoal * Number(tenant.pointsEarnRate);
    const amountToGoal = Math.ceil(rawAmountToGoal / 100) * 100;

    let rewardMessage: string;
    if (pointsToGoal === 0) {
      rewardMessage =
        `🎉 You have unlocked your ${currencySymbol}${tenant.rewardValue} reward!` +
        ` Show this message at the till to claim it.`;
    } else {
      rewardMessage =
        `Spend ${currencySymbol}${amountToGoal.toLocaleString()} more` +
        ` to unlock your ${currencySymbol}${tenant.rewardValue} reward voucher`;
    }

    const lastVisit = this.formatLastVisit(customer.lastPurchaseAt);

    const reply =
      `Hi ${firstName}! 👋 Here is your ${tenant.businessName} loyalty summary:\n\n` +
      `📊 *Points:* ${customer.pointsBalance.toLocaleString()} pts\n` +
      `🏆 *Tier:* ${tierLabel}\n` +
      `🎁 *Reward:* ${rewardMessage}\n` +
      `🕐 *Last visit:* ${lastVisit}\n\n` +
      `Keep shopping and keep earning! 🛍️`;

    // Step 4 — Send session message
    const result = await this.sendSessionMessage(tenant, senderPhone, reply);

    // Step 5 & 6 — Log
    await this.logBotReply(
      tenant.id,
      customer.id,
      result.success ? TriggerStatus.SENT : TriggerStatus.FAILED,
      result.messageId ?? null,
    );
  }

  private async getTierLabel(
    tierId: string,
    tenantId: string,
  ): Promise<string> {
    const tier = await this.tierConfigRepo.findOne({
      where: { id: tierId, tenantId },
    });
    return tier?.tierLabel ?? 'Not yet assigned';
  }

  private formatLastVisit(lastPurchaseAt: Date | null): string {
    if (!lastPurchaseAt) return 'No purchases yet';
    const diff = DateTime.now().diff(DateTime.fromJSDate(lastPurchaseAt), [
      'days',
    ]);
    const days = Math.floor(diff.days);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  }

  private async sendSessionMessage(
    tenant: Tenant,
    destination: string,
    text: string,
  ): Promise<{ success: boolean; messageId?: string }> {
    try {
      const apiUrl = this.config.getOrThrow<string>('GUPSHUP_API_URL');
      const apiKey = decrypt(tenant.gupshupApiKey!);

      const body = new URLSearchParams({
        channel: 'whatsapp',
        source: tenant.waPhoneNumber!,
        destination,
        'src.name': tenant.gupshupAppId!,
        message: JSON.stringify({ type: 'text', text }),
      });

      const res = await fetch(`${apiUrl}/msg`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!res.ok) {
        this.logger.error(
          `WaBot session send failed: HTTP ${res.status} phone=${maskPhone(destination)}`,
        );
        return { success: false };
      }

      const json = (await res.json()) as GupshupSessionResponse;
      return { success: true, messageId: json.messageId };
    } catch (err) {
      this.logger.error(
        `WaBot session send error: ${String(err)} phone=${maskPhone(destination)}`,
      );
      return { success: false };
    }
  }

  private async logBotReply(
    tenantId: string,
    customerId: string | null,
    status: TriggerStatus,
    waMessageId: string | null,
  ): Promise<void> {
    const log = this.triggerLogRepo.create({
      tenantId,
      triggerType: TriggerType.BALANCE_BOT_REPLY,
      status,
      waMessageId,
      skipReason: null,
    });
    if (customerId) {
      log.customer = { id: customerId } as unknown as Customer;
    }
    await this.triggerLogRepo.save(log);
  }
}
