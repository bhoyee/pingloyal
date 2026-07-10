import { Injectable } from '@nestjs/common';
import { TriggerType } from '@pingloyal/types';
import { Customer } from '../modules/customers/entities/customer.entity';
import { Tenant } from '../modules/tenants/entities/tenant.entity';

export interface MessageBuildResult {
  templateName: string | null;
  variables: string[];
  rawMessage?: string;
  useRawMessage?: boolean;
}

function substituteVars(
  body: string,
  customer: Customer | null,
  tenant: Tenant,
  data: Record<string, string>,
): string {
  const firstName = customer?.fullName.split(' ')[0] ?? 'there';
  const vars: Record<string, string> = {
    firstName,
    businessName: tenant.businessName,
    pointsThreshold: tenant.pointsThreshold.toString(),
    rewardValue: tenant.rewardValue.toString(),
    pointsBalance: (customer?.pointsBalance ?? 0).toString(),
    ...data,
  };
  return body.replace(
    /\{\{(\w+)\}\}/g,
    (_, key: string) => vars[key] ?? `{{${key}}}`,
  );
}

@Injectable()
export class MessageBuilderService {
  build(
    type: TriggerType,
    customer: Customer | null,
    tenant: Tenant,
    data: Record<string, string>,
    customBody?: string,
  ): MessageBuildResult {
    if (customBody) {
      const substituted = substituteVars(customBody, customer, tenant, data);
      return {
        templateName: 'pingloyal_campaign',
        variables: [substituted],
      };
    }
    const firstName = customer?.fullName.split(' ')[0] ?? 'there';

    switch (type) {
      case TriggerType.WELCOME:
        return {
          templateName: 'pingloyal_welcome',
          variables: [
            firstName,
            tenant.businessName,
            tenant.pointsThreshold.toString(),
            tenant.rewardValue.toString(),
          ],
        };

      case TriggerType.PURCHASE_CONFIRMATION:
        return {
          templateName: 'pingloyal_purchase_confirm',
          variables: [
            firstName,
            data.pointsEarned,
            tenant.businessName,
            data.newBalance,
            Math.round(
              (Number(data.newBalance) / tenant.pointsThreshold) * 100,
            ).toString(),
            tenant.rewardValue.toString(),
          ],
        };

      case TriggerType.THRESHOLD_NUDGE:
        return {
          templateName: 'pingloyal_threshold_nudge',
          variables: [
            firstName,
            (customer?.pointsBalance ?? 0).toString(),
            tenant.businessName,
            data.amountToGoal,
            tenant.rewardValue.toString(),
          ],
        };

      case TriggerType.REWARD_UNLOCKED:
        return {
          templateName: 'pingloyal_reward_unlocked',
          variables: [
            firstName,
            tenant.rewardValue.toString(),
            tenant.businessName,
          ],
        };

      case TriggerType.BIRTHDAY:
        return {
          templateName: 'pingloyal_birthday',
          variables: [firstName, tenant.businessName],
        };

      case TriggerType.LAPSED_WINBACK:
        return {
          templateName: 'pingloyal_lapsed_winback',
          variables: [firstName, tenant.businessName, data.daysSinceVisit],
        };

      case TriggerType.CAMPAIGN_MESSAGE:
        // Raw message with variable substitution — implemented in Prompt 28
        return { templateName: null, variables: [], useRawMessage: true };

      case TriggerType.BALANCE_BOT_REPLY:
        // Free-form reply within 24h service window
        return { templateName: null, variables: [], rawMessage: data.message };

      case TriggerType.WALLET_LOW_BALANCE:
        return {
          templateName: 'pingloyal_wallet_low',
          variables: [
            data.ownerFirstName || 'there',
            data.balance,
            data.topUpUrl || 'https://app.pingloyal.com/billing/wallet/topup',
          ],
        };

      case TriggerType.WALLET_ZERO:
        return {
          templateName: 'pingloyal_wallet_zero',
          variables: [
            data.ownerFirstName || 'there',
            data.topUpUrl || 'https://app.pingloyal.com/billing/wallet/topup',
          ],
        };

      case TriggerType.REWARD_REDEEMED:
        return {
          templateName: 'pingloyal_reward_redeemed',
          variables: [
            firstName,
            data.rewardsCount,
            data.rewardValue,
            tenant.businessName,
            data.newBalance,
            data.progressPercent,
          ],
        };

      default:
        throw new Error(`Unknown trigger type: ${String(type)}`);
    }
  }
}
