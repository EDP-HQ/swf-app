export type M2bVerificationRow = {
    id: number;
    BIN_LOC: string;
    BIN_LOCATION_TARGET: string;
    TOTAL_CNT: number;
    FLAG1: string;
    FLAG2: string;
    CDNAME: string;
    SUGGESTION_MATERIAL_CNT?: number;
    EXPECTED_MATERIAL_CD?: string;
    ACTUAL_MATERIAL_CD?: string;
    VERIFICATION_RULE?: string;
};

/** Hide FDW from TARGET so long labels fit in the rack columns. */
export function formatTargetDisplay(value: string | null | undefined): string {
    if (value == null || value === '') return '';
    return String(value)
        .replace(/FDW/gi, '')
        .replace(/\s*,\s*,+/g, ',')
        .replace(/^[,\s]+|[,\s]+$/g, '')
        .replace(/[_\-\s]{2,}/g, ' ')
        .replace(/^[\s_\-]+|[\s_\-]+$/g, '')
        .trim();
}

function normalizeRow(raw: Record<string, unknown>, index: number): M2bVerificationRow {
    return {
        id: index + 1,
        BIN_LOC: String(raw.BIN_LOC ?? raw.bin_loc ?? ''),
        BIN_LOCATION_TARGET: String(raw.BIN_LOCATION_TARGET ?? raw.bin_location_target ?? ''),
        TOTAL_CNT: Number(raw.TOTAL_CNT ?? raw.total_cnt ?? 0),
        FLAG1: String(raw.FLAG1 ?? raw.flag1 ?? 'Y'),
        FLAG2: String(raw.FLAG2 ?? raw.flag2 ?? 'Y'),
        CDNAME: String(raw.CDNAME ?? raw.cdname ?? 'Unknown'),
        SUGGESTION_MATERIAL_CNT: Number(raw.SUGGESTION_MATERIAL_CNT ?? raw.suggestion_material_cnt ?? 0),
        EXPECTED_MATERIAL_CD: raw.EXPECTED_MATERIAL_CD != null ? String(raw.EXPECTED_MATERIAL_CD) : undefined,
        ACTUAL_MATERIAL_CD: raw.ACTUAL_MATERIAL_CD != null ? String(raw.ACTUAL_MATERIAL_CD) : undefined,
        VERIFICATION_RULE: raw.VERIFICATION_RULE != null ? String(raw.VERIFICATION_RULE) : 'M2B'
    };
}

export async function fetchM2bVerificationData(): Promise<M2bVerificationRow[]> {
    const res = await fetch(`/api/warehouse/sfcwr/material-verification-m2b?udate=${Date.now()}`, {
        cache: 'no-store'
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg =
            err && typeof err === 'object' && 'error' in err && typeof err.error === 'string'
                ? err.error
                : `API error ${res.status}`;
        throw new Error(msg);
    }

    const body: unknown = await res.json();
    if (!Array.isArray(body)) return [];
    return body.map((row, i) => normalizeRow(row as Record<string, unknown>, i));
}
