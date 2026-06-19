import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TriggerType } from '@pingloyal/types';
import { WaTriggerTemplate } from './entities/wa-trigger-template.entity';

export interface TemplateEntry {
  triggerType: string;
  label: string;
  defaultBody: string;
  customBody: string | null;
  activeBody: string;
  isCustom: boolean;
  variables: string[];
  updatedAt: Date | null;
}

// Trigger types that have editable templates (automation triggers only).
export const TEMPLATABLE_TRIGGER_TYPES = [
  TriggerType.WELCOME,
  TriggerType.PURCHASE_CONFIRMATION,
  TriggerType.THRESHOLD_NUDGE,
  TriggerType.REWARD_UNLOCKED,
  TriggerType.BIRTHDAY,
  TriggerType.LAPSED_WINBACK,
] as const;

export const TEMPLATE_DEFAULTS: Record<
  string,
  { label: string; body: string; variables: string[] }
> = {
  [TriggerType.WELCOME]: {
    label: 'Welcome Message',
    body: `Hi {{firstName}}! 🎉 Welcome to {{businessName}} Loyalty!

Earn points on every purchase and collect {{pointsThreshold}} points to unlock a ₦{{rewardValue}} reward. Start earning today!`,
    variables: ['firstName', 'businessName', 'pointsThreshold', 'rewardValue'],
  },
  [TriggerType.PURCHASE_CONFIRMATION]: {
    label: 'Purchase Confirmation',
    body: `Hi {{firstName}}! 🛍️ You just earned {{pointsEarned}} points at {{businessName}}.

Your balance is now {{pointsBalance}} pts. Keep shopping to unlock your ₦{{rewardValue}} reward!`,
    variables: [
      'firstName',
      'businessName',
      'pointsEarned',
      'pointsBalance',
      'rewardValue',
    ],
  },
  [TriggerType.THRESHOLD_NUDGE]: {
    label: '80% Threshold Nudge',
    body: `Hi {{firstName}}! 🔥 You're almost there at {{businessName}}!

Spend just ₦{{amountToGoal}} more to unlock your ₦{{rewardValue}} reward. Don't stop now!`,
    variables: [
      'firstName',
      'businessName',
      'pointsBalance',
      'amountToGoal',
      'rewardValue',
    ],
  },
  [TriggerType.REWARD_UNLOCKED]: {
    label: 'Reward Unlocked',
    body: `Hi {{firstName}}! 🎁 Congratulations — you've unlocked your ₦{{rewardValue}} reward at {{businessName}}!

Show this message at the till to claim it. Well done! 🙌`,
    variables: ['firstName', 'businessName', 'rewardValue'],
  },
  [TriggerType.BIRTHDAY]: {
    label: 'Birthday Message',
    body: `Hi {{firstName}}! 🎂 Happy Birthday from everyone at {{businessName}}!

Wishing you a wonderful day filled with joy. Enjoy your special day!`,
    variables: ['firstName', 'businessName'],
  },
  [TriggerType.LAPSED_WINBACK]: {
    label: 'Lapsed Customer Win-back',
    body: `Hi {{firstName}}! 👋 We miss you at {{businessName}}!

It's been {{daysSinceVisit}} days since your last visit. Come back and keep earning toward your ₦{{rewardValue}} reward!`,
    variables: ['firstName', 'businessName', 'daysSinceVisit', 'rewardValue'],
  },
};

@Injectable()
export class WaTemplatesService {
  constructor(
    @InjectRepository(WaTriggerTemplate)
    private readonly repo: Repository<WaTriggerTemplate>,
  ) {}

  async findAll(tenantId: string): Promise<TemplateEntry[]> {
    const customs = await this.repo.find({ where: { tenantId } });
    const customMap = new Map(customs.map((c) => [c.triggerType, c]));

    return TEMPLATABLE_TRIGGER_TYPES.map((type) => {
      const defaults = TEMPLATE_DEFAULTS[type];
      const custom = customMap.get(type) ?? null;
      return {
        triggerType: type,
        label: defaults.label,
        defaultBody: defaults.body,
        customBody: custom?.body ?? null,
        activeBody: custom?.body ?? defaults.body,
        isCustom: custom !== null,
        variables: defaults.variables,
        updatedAt: custom?.updatedAt ?? null,
      };
    });
  }

  async findCustom(
    tenantId: string,
    triggerType: string,
  ): Promise<WaTriggerTemplate | null> {
    return this.repo.findOne({ where: { tenantId, triggerType } });
  }

  async upsert(
    tenantId: string,
    triggerType: string,
    body: string,
  ): Promise<TemplateEntry> {
    if (
      !(TEMPLATABLE_TRIGGER_TYPES as readonly string[]).includes(triggerType)
    ) {
      throw new BadRequestException(
        `Unknown or non-editable trigger type: ${triggerType}`,
      );
    }

    const existing = await this.repo.findOne({
      where: { tenantId, triggerType },
    });

    if (existing) {
      await this.repo.update(existing.id, { body });
    } else {
      await this.repo.save(this.repo.create({ tenantId, triggerType, body }));
    }

    const defaults = TEMPLATE_DEFAULTS[triggerType];
    return {
      triggerType,
      label: defaults.label,
      defaultBody: defaults.body,
      customBody: body,
      activeBody: body,
      isCustom: true,
      variables: defaults.variables,
      updatedAt: new Date(),
    };
  }

  async reset(tenantId: string, triggerType: string): Promise<TemplateEntry> {
    if (
      !(TEMPLATABLE_TRIGGER_TYPES as readonly string[]).includes(triggerType)
    ) {
      throw new NotFoundException(`Unknown trigger type: ${triggerType}`);
    }

    await this.repo.delete({ tenantId, triggerType });

    const defaults = TEMPLATE_DEFAULTS[triggerType];
    return {
      triggerType,
      label: defaults.label,
      defaultBody: defaults.body,
      customBody: null,
      activeBody: defaults.body,
      isCustom: false,
      variables: defaults.variables,
      updatedAt: null,
    };
  }
}
