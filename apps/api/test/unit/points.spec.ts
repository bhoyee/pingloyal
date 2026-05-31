import { calculatePointsEarned } from '../../src/modules/transactions/transactions.service';

// ── Points Calculation ─────────────────────────────────────────────────────────
// earnRate = naira PER point (default 100 → spend ₦100 to earn 1 point)

describe('Points Calculation', () => {
  describe('calculatePointsEarned(amount, earnRate)', () => {
    it('₦500 with earnRate=100 → 5 points', () => {
      expect(calculatePointsEarned('500', 100)).toBe(5);
    });

    it('₦1,000 with earnRate=100 → 10 points', () => {
      expect(calculatePointsEarned('1000', 100)).toBe(10);
    });

    it('₦99 with earnRate=100 → 0 points (floors to zero)', () => {
      expect(calculatePointsEarned('99', 100)).toBe(0);
    });

    it('₦100 with earnRate=100 → 1 point (exactly on boundary)', () => {
      expect(calculatePointsEarned('100', 100)).toBe(1);
    });

    it('₦1,500 with earnRate=100 → 15 points', () => {
      expect(calculatePointsEarned('1500', 100)).toBe(15);
    });

    it('₦500 with earnRate=50 → 10 points (₦50 per point = more points)', () => {
      expect(calculatePointsEarned('500', 50)).toBe(10);
    });

    it('₦500 with earnRate=200 → 2 points (₦200 per point = fewer points)', () => {
      expect(calculatePointsEarned('500', 200)).toBe(2);
    });

    it('₦0 → 0 points (zero amount)', () => {
      expect(calculatePointsEarned('0', 100)).toBe(0);
    });

    it('₦999,999 with earnRate=100 → 9,999 points (large amount)', () => {
      expect(calculatePointsEarned('999999', 100)).toBe(9999);
    });

    it('₦1,050.75 with earnRate=100 → 10 points (floors decimal, not rounds)', () => {
      expect(calculatePointsEarned('1050.75', 100)).toBe(10);
    });

    it('earnRate=0.5 → customer earns 2 points per ₦1 (fractional earn rate)', () => {
      expect(calculatePointsEarned('500', 0.5)).toBe(1000);
    });

    it('earnRate=1000 → customer needs ₦1,000 per point', () => {
      expect(calculatePointsEarned('1000', 1000)).toBe(1);
    });
  });

  describe('threshold percentage calculation', () => {
    function progressPercent(balance: number, threshold: number): number {
      return Math.round((balance / threshold) * 100 * 10) / 10;
    }

    it('800 points with threshold 1000 → 80%', () => {
      expect(progressPercent(800, 1000)).toBe(80);
    });

    it('1000 points with threshold 1000 → 100%', () => {
      expect(progressPercent(1000, 1000)).toBe(100);
    });

    it('790 points with threshold 1000 → 79%', () => {
      expect(progressPercent(790, 1000)).toBe(79);
    });

    it('1050 points with threshold 1000 → 105% (over threshold)', () => {
      expect(progressPercent(1050, 1000)).toBe(105);
    });

    it('0 points with threshold 1000 → 0%', () => {
      expect(progressPercent(0, 1000)).toBe(0);
    });

    it('1 point with threshold 1000 → 0.1%', () => {
      expect(progressPercent(1, 1000)).toBe(0.1);
    });
  });
});
