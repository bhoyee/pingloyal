export declare class PhoneNormalisationError extends Error {
    constructor(message: string);
}
export type DefaultCountry = 'NG' | 'GB' | 'US';
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
export declare function normalisePhone(raw: string | null | undefined, defaultCountry?: DefaultCountry): string;
/**
 * Masks the middle portion of an E.164 number for safe display.
 * Shows the first 7 characters and last 2 digits; replaces the rest with *.
 * Numbers of 9 characters or fewer are returned unmasked.
 *
 * Examples:
 *   +2348012345678 → +234801*****78
 *   +447911123456  → +447911****56
 */
export declare function maskPhone(e164: string): string;
//# sourceMappingURL=phone.d.ts.map