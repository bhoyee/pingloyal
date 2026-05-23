/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns '{iv_hex}:{authTag_hex}:{ciphertext_hex}'.
 * IV is randomly generated on every call — never reused.
 */
export declare function encrypt(plaintext: string): string;
/**
 * Decrypts a value produced by encrypt().
 * Throws if the format is invalid or the auth tag check fails (tampering).
 */
export declare function decrypt(stored: string): string;
//# sourceMappingURL=encryption.d.ts.map