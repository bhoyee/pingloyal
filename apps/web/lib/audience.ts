import type { Campaign, Category, TierConfig } from './api';

export function describeAudience(
  campaign: Campaign,
  tiers: TierConfig[],
  categories: Category[],
  lapsedDays: number,
): string {
  const r = campaign.segmentRules;

  if (r.tierIds?.length) {
    const labels = r.tierIds.map((id) => tiers.find((t) => t.id === id)?.tierLabel ?? 'Tier');
    return `${labels.join(', ')} tier only`;
  }

  if (r.categoryIds?.length) {
    const labels = r.categoryIds.map((id) => categories.find((c) => c.id === id)?.name ?? 'category');
    return `Bought ${labels.join(', ').toLowerCase()} items`;
  }

  if (r.activityStatus === 'inactive') {
    return `Inactive ${lapsedDays}+ days`;
  }

  if (r.minPoints) {
    return `${r.minPoints}+ points`;
  }

  if (r.activityStatus === 'active') {
    return 'All active customers';
  }

  return 'All customers';
}
