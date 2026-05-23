export declare class PhoneNormalisationError extends Error {
    constructor(raw: string);
}
/**
 * Normalises a raw phone string to E.164.
 * Accepts E.164 (+2348012345678), international without + (2348012345678),
 * and local/national format (08012345678 for NG/UK).
 * Throws PhoneNormalisationError when the input cannot be resolved.
 */
export declare function normalisePhone(raw: string): string;
/**
 * Masks the middle portion of an E.164 number for display.
 * "+2348012345678" → "+234801****78"
 */
export declare function maskPhone(e164: string): string;
//# sourceMappingURL=phone.d.ts.map