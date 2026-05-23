import * as crypto from 'crypto';

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes)',
    );
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns '{iv_hex}:{authTag_hex}:{ciphertext_hex}'.
 * IV is randomly generated on every call — never reused.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
}

/**
 * Decrypts a value produced by encrypt().
 * Throws if the format is invalid or the auth tag check fails (tampering).
 */
export function decrypt(stored: string): string {
  const parts = stored.split(':');
  if (parts.length !== 3) {
    throw new Error(
      `Invalid encrypted format: expected 'iv:authTag:ciphertext', got ${parts.length} parts`,
    );
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;

  try {
    const key = getKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(ciphertextHex, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    return plaintext;
  } catch (err) {
    throw new Error(
      `Decryption failed: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
  }
}
