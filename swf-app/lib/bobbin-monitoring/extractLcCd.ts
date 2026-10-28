/**
 * Lifespan/cycle check applies to PB18 barcodes only (last-4 LC_CD lookup).
 * Other prefixes (e.g. PB40_0005) use scrap-only flow with the full scanned code.
 */
export function isPb18LifespanBobbinCode(code: string): boolean {
    return /^PB18/i.test(code.trim());
}

/**
 * LC_CD = last 4 digits of the scanned code (digits only, then take last 4).
 * Pads with leading zeros if fewer than 4 digits exist.
 */
export function extractLcCdFromBobbinCode(code: string): string | null {
    const trimmed = code.trim();
    if (!trimmed) return null;
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 0) return null;
    const last4 = digits.slice(-4);
    return last4.length < 4 ? last4.padStart(4, '0') : last4;
}
