"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhoneNormalisationError = void 0;
exports.normalisePhone = normalisePhone;
exports.maskPhone = maskPhone;
class PhoneNormalisationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PhoneNormalisationError';
    }
}
exports.PhoneNormalisationError = PhoneNormalisationError;
const COUNTRY_RULES = [
    // Nigeria: 08012345678 → +2348012345678 (10-digit subscriber)
    { countryCode: '234', localPrefix: '0', localTotalLength: 11 },
    // UK:      07911123456 → +447911123456  (10-digit subscriber)
    { countryCode: '44', localPrefix: '0', localTotalLength: 11 },
    // US/CA:   2025550123  → +12025550123   (10-digit, no trunk prefix)
    { countryCode: '1', localPrefix: '', localTotalLength: 10 },
];
const COUNTRY_CODE = {
    NG: '234',
    GB: '44',
    US: '1',
};
// E.164: + followed by 1 non-zero digit then 6–14 more digits (ITU-T E.164)
const E164_RE = /^\+[1-9]\d{6,14}$/;
/**
 * Fixes the common Nigerian mistake of including the trunk 0 after the
 * country code in E.164 format: +23408XXXXXXXXX → +234 8XXXXXXXXX
 * Only fires when the result would otherwise be 15 chars (one digit too long).
 */
function fixNgExtraZero(e164) {
    // +234 + 0 + 10 subscriber digits = 15 chars total
    if (/^\+2340\d{10}$/.test(e164)) {
        return '+234' + e164.slice(5);
    }
    return e164;
}
function ruleFor(country) {
    return COUNTRY_RULES.find((r) => r.countryCode === COUNTRY_CODE[country]);
}
/**
 * Normalises a raw phone string to E.164 format.
 *
 * Accepted inputs (examples for Nigeria with defaultCountry='NG'):
 *   +2348012345678   — already E.164
 *   2348012345678    — international without +
 *   08012345678      — local/national format
 *   8012345678       — subscriber digits only
 *   0801 234 5678    — local with spaces
 *   (080) 1234-5678  — local with punctuation
 *   0234 801 234 5678 — erroneous 0-prefix before country code
 *   +23408012345678  — E.164 with trunk 0 crept in after country code
 *   0044 7911 123456 — international dialling prefix for UK
 *
 * @param raw           Raw phone input (null/undefined → throws immediately)
 * @param defaultCountry Country to assume for ambiguous local-format numbers
 *                       (e.g. 11-digit 0-prefixed numbers match both NG and GB).
 *                       Defaults to 'NG'.
 */
function normalisePhone(raw, defaultCountry = 'NG') {
    // ── 1. Null / undefined / empty ─────────────────────────────────────────────
    if (raw == null || typeof raw !== 'string' || !raw.trim()) {
        throw new PhoneNormalisationError('Phone number is required');
    }
    const trimmed = raw.trim();
    // ── 2. Strip visual noise, preserving at most one leading + ─────────────────
    let cleaned;
    if (trimmed.startsWith('+')) {
        cleaned = '+' + trimmed.slice(1).replace(/\D/g, '');
    }
    else {
        cleaned = trimmed.replace(/\D/g, '');
    }
    if (!cleaned || cleaned === '+') {
        throw new PhoneNormalisationError(`Cannot normalise phone number: "${raw}"`);
    }
    // ── 3. International dialling prefix 0044 → +44 ─────────────────────────────
    if (cleaned.startsWith('0044')) {
        cleaned = '+44' + cleaned.slice(4);
    }
    // ── 4. Leading 0 + country code (e.g. 0234... → 234...) ─────────────────────
    // A user sometimes prepends a local trunk 0 before the international code.
    for (const rule of COUNTRY_RULES) {
        if (rule.localPrefix && cleaned.startsWith('0' + rule.countryCode)) {
            cleaned = cleaned.slice(1); // strip the erroneous leading 0
            break;
        }
    }
    // ── 5. Already E.164 (starts with +) ────────────────────────────────────────
    if (cleaned.startsWith('+')) {
        cleaned = fixNgExtraZero(cleaned);
        if (E164_RE.test(cleaned))
            return cleaned;
        throw new PhoneNormalisationError(`Cannot normalise phone number: "${raw}"`);
    }
    // ── Digit-only strings from here ─────────────────────────────────────────────
    if (!/^\d+$/.test(cleaned)) {
        throw new PhoneNormalisationError(`Cannot normalise phone number: "${raw}"`);
    }
    // ── 6. International without + (e.g. 2348012345678, 447911123456) ────────────
    for (const rule of COUNTRY_RULES) {
        const subLen = rule.localTotalLength - rule.localPrefix.length;
        if (cleaned.startsWith(rule.countryCode) &&
            cleaned.length === rule.countryCode.length + subLen) {
            const e164 = fixNgExtraZero(`+${cleaned}`);
            if (E164_RE.test(e164))
                return e164;
        }
    }
    // ── 7. Local / national format with trunk prefix (e.g. 08012345678) ──────────
    // defaultCountry is checked first to resolve NG vs GB ambiguity:
    // both share localPrefix='0' and localTotalLength=11.
    const preferred = ruleFor(defaultCountry);
    const ordered = [preferred, ...COUNTRY_RULES.filter((r) => r !== preferred)];
    for (const rule of ordered) {
        if (rule.localPrefix &&
            cleaned.startsWith(rule.localPrefix) &&
            cleaned.length === rule.localTotalLength) {
            const subscriber = cleaned.slice(rule.localPrefix.length);
            const e164 = `+${rule.countryCode}${subscriber}`;
            if (E164_RE.test(e164))
                return e164;
        }
    }
    // ── 8. Subscriber digits only (no trunk prefix), use defaultCountry ──────────
    const subLen = preferred.localTotalLength - preferred.localPrefix.length;
    if (cleaned.length === subLen) {
        const e164 = `+${preferred.countryCode}${cleaned}`;
        if (E164_RE.test(e164))
            return e164;
    }
    throw new PhoneNormalisationError(`Cannot normalise phone number: "${raw}"`);
}
/**
 * Masks the middle portion of an E.164 number for safe display.
 * Shows the first 7 characters and last 2 digits; replaces the rest with *.
 * Numbers of 9 characters or fewer are returned unmasked.
 *
 * Examples:
 *   +2348012345678 → +234801*****78
 *   +447911123456  → +447911****56
 */
function maskPhone(e164) {
    if (e164.length <= 9)
        return e164;
    const head = 7;
    const tail = 2;
    const maskLen = Math.max(0, e164.length - head - tail);
    return e164.slice(0, head) + '*'.repeat(maskLen) + e164.slice(e164.length - tail);
}
//# sourceMappingURL=phone.js.map