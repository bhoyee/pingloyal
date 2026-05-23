import {
  normalisePhone,
  maskPhone,
  PhoneNormalisationError,
} from '@pingloyal/utils';

describe('normalisePhone', () => {
  it('normalises Nigerian local format (08xx) to E.164', () => {
    expect(normalisePhone('08012345678')).toBe('+2348012345678');
  });

  it('normalises Nigerian international without + to E.164', () => {
    expect(normalisePhone('2348012345678')).toBe('+2348012345678');
  });

  it('returns valid E.164 input unchanged', () => {
    expect(normalisePhone('+2348012345678')).toBe('+2348012345678');
  });

  it('throws PhoneNormalisationError for an unrecognised number', () => {
    expect(() => normalisePhone('12345')).toThrow(PhoneNormalisationError);
    expect(() => normalisePhone('not-a-phone')).toThrow(
      PhoneNormalisationError,
    );
  });
});

describe('maskPhone', () => {
  it('masks middle digits leaving first 4 and last 2 visible', () => {
    expect(maskPhone('+2348012345678')).toBe('+234********78');
  });

  it('returns short strings unchanged', () => {
    expect(maskPhone('+234')).toBe('+234');
  });
});
