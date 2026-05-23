"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhoneNormalisationError = void 0;
exports.normalisePhone = normalisePhone;
exports.maskPhone = maskPhone;
class PhoneNormalisationError extends Error {
    constructor(raw) {
        super(`Cannot normalise phone number: "${raw}"`);
        this.name = 'PhoneNormalisationError';
    }
}
exports.PhoneNormalisationError = PhoneNormalisationError;
const COUNTRY_RULES = [
    // Nigeria: 08012345678 → +2348012345678 (subscriber = 10 digits)
    { countryCode: '234', localPrefix: '0', localTotalLength: 11 },
    // UK: 07911123456 → +447911123456 (subscriber = 10 digits)
    { countryCode: '44', localPrefix: '0', localTotalLength: 11 },
    // US/Canada: 2025550123 → +12025550123 (no trunk prefix, 10 digits)
    { countryCode: '1', localPrefix: '', localTotalLength: 10 },
];
/**
 * Normalises a raw phone string to E.164.
 * Accepts E.164 (+2348012345678), international without + (2348012345678),
 * and local/national format (08012345678 for NG/UK).
 * Throws PhoneNormalisationError when the input cannot be resolved.
 */
function normalisePhone(raw) {
    // Strip visual separators only; preserve leading +
    const cleaned = raw.replace(/[\s\-().]/g, '');
    if (!cleaned)
        throw new PhoneNormalisationError(raw);
    // Already valid E.164 (+<7-15 digits>)
    if (/^\+\d{7,15}$/.test(cleaned))
        return cleaned;
    // From here we only handle digit-only strings
    if (!/^\d+$/.test(cleaned))
        throw new PhoneNormalisationError(raw);
    for (const rule of COUNTRY_RULES) {
        const subscriberLength = rule.localTotalLength - rule.localPrefix.length;
        // International without +: starts with country code, followed by exactly subscriberLength digits
        if (cleaned.startsWith(rule.countryCode) &&
            cleaned.length === rule.countryCode.length + subscriberLength) {
            return `+${cleaned}`;
        }
        // Local/national format: starts with trunk prefix, total length matches
        if (rule.localPrefix !== '' &&
            cleaned.startsWith(rule.localPrefix) &&
            cleaned.length === rule.localTotalLength) {
            const subscriber = cleaned.slice(rule.localPrefix.length);
            return `+${rule.countryCode}${subscriber}`;
        }
    }
    throw new PhoneNormalisationError(raw);
}
/**
 * Masks the middle portion of an E.164 number for display.
 * "+2348012345678" → "+234801****78"
 */
function maskPhone(e164) {
    if (e164.length <= 8)
        return e164;
    const head = 4;
    const tail = 2;
    const mask = '*'.repeat(Math.max(0, e164.length - head - tail));
    return e164.slice(0, head) + mask + e164.slice(e164.length - tail);
}
//# sourceMappingURL=phone.js.map