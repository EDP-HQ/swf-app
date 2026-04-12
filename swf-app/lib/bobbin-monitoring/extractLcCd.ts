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
