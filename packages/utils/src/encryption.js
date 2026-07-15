"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
const crypto = __importStar(require("crypto"));
function getKey() {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error('ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes)');
    }
    return Buffer.from(hex, 'hex');
}
/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns '{iv_hex}:{authTag_hex}:{ciphertext_hex}'.
 * IV is randomly generated on every call — never reused.
 */
function encrypt(plaintext) {
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
function decrypt(stored) {
    const parts = stored.split(':');
    if (parts.length !== 3) {
        throw new Error(`Invalid encrypted format: expected 'iv:authTag:ciphertext', got ${parts.length} parts`);
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
    }
    catch (err) {
        throw new Error(`Decryption failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
}
//# sourceMappingURL=encryption.js.map