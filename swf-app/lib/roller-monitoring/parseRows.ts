/** Read a field from a SQL row regardless of key casing. */
export function rowVal(row: Record<string, unknown>, ...keys: string[]): unknown {
    for (const key of keys) {
        if (key in row && row[key] != null && row[key] !== '') return row[key];
        const upper = key.toUpperCase();
        if (upper in row && row[upper] != null && row[upper] !== '') return row[upper];
        const lower = key.toLowerCase();
        if (lower in row && row[lower] != null && row[lower] !== '') return row[lower];
    }
    return undefined;
}

export function rowStr(row: Record<string, unknown>, ...keys: string[]): string {
    const v = rowVal(row, ...keys);
    return v == null ? '' : String(v).trim();
}

export function rowNum(row: Record<string, unknown>, ...keys: string[]): number {
    const v = rowVal(row, ...keys);
    if (v == null || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

export function asRecordArray(body: unknown): Record<string, unknown>[] {
    if (!Array.isArray(body)) return [];
    return body.filter((r): r is Record<string, unknown> => r != null && typeof r === 'object');
}
