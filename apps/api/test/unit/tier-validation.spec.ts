import { validateTiers } from '../../src/modules/tenants/utils/validate-tiers.util';

describe('TierConfig overlap validation', () => {
  it('should pass: 3 non-overlapping tiers', () => {
    const tiers = [
      { tierName: 'standard', min: 0, max: 99999 },
      { tierName: 'mid', min: 100000, max: 399999 },
      { tierName: 'vip', min: 400000, max: null },
    ];
    expect(() => validateTiers(tiers)).not.toThrow();
  });

  it('should fail: mid and vip overlap', () => {
    const tiers = [
      { tierName: 'mid', min: 100000, max: 450000 },
      { tierName: 'vip', min: 400000, max: null },
    ];
    expect(() => validateTiers(tiers)).toThrow('overlaps');
  });

  it('should pass: single tier with no max', () => {
    const tiers = [{ tierName: 'all', min: 0, max: null }];
    expect(() => validateTiers(tiers)).not.toThrow();
  });

  it('should fail: two tiers both starting at 0', () => {
    const tiers = [
      { tierName: 'a', min: 0, max: 100000 },
      { tierName: 'b', min: 0, max: 200000 },
    ];
    expect(() => validateTiers(tiers)).toThrow('overlaps');
  });

  it('should fail: maxQuarterlySpend less than minQuarterlySpend', () => {
    const tiers = [{ tierName: 'bad', min: 500000, max: 100000 }];
    expect(() => validateTiers(tiers)).toThrow();
  });

  it('should fail: empty tiers array', () => {
    expect(() => validateTiers([])).toThrow('At least 1 tier required');
  });

  it('should fail: more than 5 tiers', () => {
    const tiers = Array.from({ length: 6 }, (_, i) => ({
      tierName: `tier${i}`,
      min: i * 100000,
      max: (i + 1) * 100000,
    }));
    expect(() => validateTiers(tiers)).toThrow('Maximum 5 tiers');
  });
});
