import { decrypt, encrypt } from '@pingloyal/utils';

const TEST_KEY = 'a'.repeat(64); // 64 hex chars = valid 32-byte key

beforeAll(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY;
});

afterAll(() => {
  delete process.env.ENCRYPTION_KEY;
});

describe('encryption utility', () => {
  it('encrypt then decrypt returns original plaintext', () => {
    const original = 'super-secret-api-key-value';
    expect(decrypt(encrypt(original))).toBe(original);
  });

  it('encrypt called twice on same input produces different ciphertexts (random IV)', () => {
    const plaintext = 'same-input-every-time';
    const first = encrypt(plaintext);
    const second = encrypt(plaintext);
    expect(first).not.toBe(second);
    // Both must still decrypt correctly
    expect(decrypt(first)).toBe(plaintext);
    expect(decrypt(second)).toBe(plaintext);
  });

  it('decrypt with tampered ciphertext throws an error', () => {
    const encrypted = encrypt('original');
    const [iv, tag] = encrypted.split(':');
    const tampered = `${iv}:${tag}:deadbeef00112233`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it('decrypt with tampered authTag throws an error', () => {
    const encrypted = encrypt('original');
    const [iv, , cipher] = encrypted.split(':');
    const tampered = `${iv}:ffffffffffffffffffffffffffffffff:${cipher}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it('decrypt with invalid format string throws descriptive error', () => {
    expect(() => decrypt('not-valid-format')).toThrow(
      'Invalid encrypted format',
    );
  });

  it('encrypt handles empty string', () => {
    const result = encrypt('');
    expect(result).toMatch(/^[0-9a-f]+:[0-9a-f]+:$/);
    expect(decrypt(result)).toBe('');
  });

  it('encrypt handles special characters and Unicode (₦ symbol etc.)', () => {
    const special = '₦ loyalty: café résumé 日本語 🎉';
    expect(decrypt(encrypt(special))).toBe(special);
  });
});
