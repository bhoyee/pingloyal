import {
  normalisePhone,
  maskPhone,
  PhoneNormalisationError,
} from '@pingloyal/utils';

// ── normalisePhone ─────────────────────────────────────────────────────────────

describe('normalisePhone', () => {
  // ── Nigerian numbers (defaultCountry = 'NG', the default) ───────────────────

  describe('Nigerian numbers — defaultCountry NG', () => {
    it('normalises local format 08012345678 → +2348012345678', () => {
      expect(normalisePhone('08012345678')).toBe('+2348012345678');
    });

    it('normalises subscriber-only 8012345678 → +2348012345678', () => {
      expect(normalisePhone('8012345678')).toBe('+2348012345678');
    });

    it('returns already-valid E.164 +2348012345678 unchanged', () => {
      expect(normalisePhone('+2348012345678')).toBe('+2348012345678');
    });

    it('normalises international without + 2348012345678 → +2348012345678', () => {
      expect(normalisePhone('2348012345678')).toBe('+2348012345678');
    });

    it('strips hyphens: 234-801-234-5678 → +2348012345678', () => {
      expect(normalisePhone('234-801-234-5678')).toBe('+2348012345678');
    });

    it('strips spaces: 0801 234 5678 → +2348012345678', () => {
      expect(normalisePhone('0801 234 5678')).toBe('+2348012345678');
    });

    it('strips brackets and hyphens: (080) 1234-5678 → +2348012345678', () => {
      expect(normalisePhone('(080) 1234-5678')).toBe('+2348012345678');
    });

    it('strips spaces in middle: 080 1234 5678 → +2348012345678', () => {
      expect(normalisePhone('080 1234 5678')).toBe('+2348012345678');
    });

    it('trims leading and trailing whitespace before normalising', () => {
      expect(normalisePhone('  08012345678  ')).toBe('+2348012345678');
    });

    it('handles 0234 prefix (trunk 0 prepended to country code): 0234 801 234 5678 → +2348012345678', () => {
      expect(normalisePhone('0234 801 234 5678')).toBe('+2348012345678');
    });

    it('fixes extra trunk 0 after country code in E.164: +23408012345678 → +2348012345678', () => {
      // A user may type +234 then accidentally include the trunk 0: +234 0 8012345678
      expect(normalisePhone('+23408012345678')).toBe('+2348012345678');
    });
  });

  // ── UK numbers ───────────────────────────────────────────────────────────────

  describe('UK numbers — defaultCountry GB', () => {
    it('normalises local format 07911123456 → +447911123456', () => {
      expect(normalisePhone('07911123456', 'GB')).toBe('+447911123456');
    });

    it('normalises subscriber-only 7911123456 → +447911123456', () => {
      expect(normalisePhone('7911123456', 'GB')).toBe('+447911123456');
    });

    it('returns already-valid E.164 +447911123456 unchanged', () => {
      expect(normalisePhone('+447911123456')).toBe('+447911123456');
    });

    it('normalises international without + 447911123456 → +447911123456', () => {
      expect(normalisePhone('447911123456')).toBe('+447911123456');
    });

    it('handles 0044 international dialling prefix: 0044 7911 123456 → +447911123456', () => {
      expect(normalisePhone('0044 7911 123456')).toBe('+447911123456');
    });

    it('strips spaces from E.164 +44 7911 123456 → +447911123456', () => {
      expect(normalisePhone('+44 7911 123456')).toBe('+447911123456');
    });
  });

  // ── Country disambiguation via defaultCountry ─────────────────────────────────

  describe('Country disambiguation', () => {
    it('08012345678 with defaultCountry=NG → Nigerian E.164', () => {
      expect(normalisePhone('08012345678', 'NG')).toBe('+2348012345678');
    });

    it('07911123456 with defaultCountry=GB → UK E.164', () => {
      expect(normalisePhone('07911123456', 'GB')).toBe('+447911123456');
    });

    // 080 in UK is a non-geographic format; when defaultCountry=GB the function
    // assumes the caller is correct and formats accordingly.
    it('08012345678 with defaultCountry=GB → UK E.164 (ambiguity resolved by defaultCountry)', () => {
      expect(normalisePhone('08012345678', 'GB')).toBe('+448012345678');
    });
  });

  // ── Invalid inputs — must throw PhoneNormalisationError ──────────────────────

  describe('Invalid inputs', () => {
    it('throws for empty string', () => {
      expect(() => normalisePhone('')).toThrow(PhoneNormalisationError);
    });

    it('throws for whitespace-only string', () => {
      expect(() => normalisePhone('   ')).toThrow(PhoneNormalisationError);
    });

    it('throws for null', () => {
      expect(() => normalisePhone(null)).toThrow(PhoneNormalisationError);
    });

    it('throws for undefined', () => {
      expect(() => normalisePhone(undefined)).toThrow(PhoneNormalisationError);
    });

    it('throws for alphabetic input "hello"', () => {
      expect(() => normalisePhone('hello')).toThrow(PhoneNormalisationError);
    });

    it('throws for too-short number "123"', () => {
      expect(() => normalisePhone('123')).toThrow(PhoneNormalisationError);
    });

    it('throws for E.164 that is too short after + (+234123)', () => {
      expect(() => normalisePhone('+234123')).toThrow(PhoneNormalisationError);
    });

    it('throws for a number that is way too long (18 digits)', () => {
      expect(() => normalisePhone('000000000000000000')).toThrow(
        PhoneNormalisationError,
      );
    });

    it('throws for mixed alpha-numeric input "08012345abc"', () => {
      expect(() => normalisePhone('08012345abc')).toThrow(
        PhoneNormalisationError,
      );
    });

    it('error message says "required" for null/undefined/empty inputs', () => {
      expect(() => normalisePhone(null)).toThrow('Phone number is required');
      expect(() => normalisePhone(undefined)).toThrow(
        'Phone number is required',
      );
      expect(() => normalisePhone('')).toThrow('Phone number is required');
    });
  });
});

// ── maskPhone ─────────────────────────────────────────────────────────────────

describe('maskPhone', () => {
  it('masks Nigerian number: +2348012345678 → +234801*****78', () => {
    expect(maskPhone('+2348012345678')).toBe('+234801*****78');
  });

  it('masks UK number: +447911123456 → +447911****56', () => {
    expect(maskPhone('+447911123456')).toBe('+447911****56');
  });

  it('masks US number: +12025551234 → +120255***34', () => {
    expect(maskPhone('+12025551234')).toBe('+120255***34');
  });

  it('returns numbers of 9 characters or fewer unmasked', () => {
    expect(maskPhone('+1234567')).toBe('+1234567'); // 7 chars
    expect(maskPhone('+12345678')).toBe('+12345678'); // 9 chars — threshold
  });

  it('masks a number that does not start with + using the same logic', () => {
    // E.g. a stored subscriber-only string
    expect(maskPhone('2348012345678')).toBe('2348012****78');
  });
});
