import { BadRequestException } from '@nestjs/common';

export interface TierInput {
  tierName: string;
  min: number;
  max: number | null;
}

export function validateTiers(tiers: TierInput[]): void {
  if (tiers.length === 0) {
    throw new BadRequestException('At least 1 tier required');
  }
  if (tiers.length > 5) {
    throw new BadRequestException('Maximum 5 tiers allowed');
  }

  for (const tier of tiers) {
    if (tier.min < 0) {
      throw new BadRequestException(
        `Tier ${tier.tierName}: minQuarterlySpend must be >= 0`,
      );
    }
    if (tier.max !== null && tier.max <= tier.min) {
      throw new BadRequestException(
        `Tier ${tier.tierName}: maxQuarterlySpend must be greater than minQuarterlySpend`,
      );
    }
  }

  for (let i = 0; i < tiers.length; i++) {
    for (let j = i + 1; j < tiers.length; j++) {
      const a = tiers[i];
      const b = tiers[j];
      const aMax = a.max ?? Infinity;
      const bMax = b.max ?? Infinity;

      if (a.min < bMax && b.min < aMax) {
        const fmt = (n: number) => `₦${n.toLocaleString('en-NG')}`;
        const aRange =
          a.max !== null ? `${fmt(a.min)}–${fmt(a.max)}` : `${fmt(a.min)}+`;
        const bRange =
          b.max !== null ? `${fmt(b.min)}–${fmt(b.max)}` : `${fmt(b.min)}+`;
        throw new BadRequestException(
          `Tier ${a.tierName} (${aRange}) overlaps with tier ${b.tierName} (${bRange})`,
        );
      }
    }
  }
}
