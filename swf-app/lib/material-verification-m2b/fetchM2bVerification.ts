export type M2bVerificationRow = {
    id: number;
    BIN_LOC: string;
    /** KBAS010 Suggestion Bin.lo label (BIN_LOCATION_DESC, not grade TARGET). */
    SUGGESTION_BIN_DESC: string;
    TOTAL_CNT: number;
    FLAG1: string;
    FLAG2: string;
    CDNAME: string;
    SUGGESTION_MATERIAL_CNT?: number;
    EXPECTED_MATERIAL_CD?: string;
    ACTUAL_MATERIAL_CD?: string;
    ACTUAL_MATERIAL_DESC?: string;
    EXPECTED_MATERIAL_DESC?: string;
    ACTUAL_SUGGESTION_BIN_CD?: string;
    ACTUAL_SUGGESTION_BIN_DESC?: string;
    INV_MATERIAL_DISTINCT_CNT?: number;
    MIN_BALANCE_LENGTH?: number | null;
    REF_MATERIAL_STD_LENGTH?: number | null;
    VERIFICATION_RULE?: string;
};

/** Suggestion bin label (store name) or FREE when unassigned — same as classic TARGET. */
export function formatSuggestionBinDisplay(value: string | null | undefined): string {
    const trimmed = value == null ? '' : String(value).trim();
    return trimmed || 'FREE';
}

/** No stock, or no material-list assignment for this bin → grey “empty rack” (classic-style). */
function formatGradeLabel(cd: string | undefined, desc: string | undefined): string {
    const code = cd?.trim();
    const d = desc?.trim();
    if (code && d) return `${code} (${d})`;
    if (code) return code;
    return '—';
}

function formatSuggestionLo(row: M2bVerificationRow, forOnRackGrade: boolean): string {
    if (forOnRackGrade) {
        const desc = row.ACTUAL_SUGGESTION_BIN_DESC?.trim();
        const cd = row.ACTUAL_SUGGESTION_BIN_CD?.trim();
        if (desc) return desc;
        if (cd) return cd;
        return 'empty → FREE';
    }
    const slot = formatSuggestionBinDisplay(row.SUGGESTION_BIN_DESC);
    if (slot === 'FREE') return 'empty → FREE';
    return slot;
}

/** Hover — narrative like KBAS010 explanation (lots, grades, suggestion bin). */
export function rackSlotHoverTitle(row: M2bVerificationRow): string | undefined {
    const slotLabel = formatSuggestionBinDisplay(row.SUGGESTION_BIN_DESC);
    const slotCode = row.BIN_LOC?.trim() || '—';
    const lotWord = row.TOTAL_CNT === 1 ? 'lot' : 'lots';
    const onRackGrade = row.ACTUAL_MATERIAL_CD?.trim();
    const onRackLabel = formatGradeLabel(onRackGrade, row.ACTUAL_MATERIAL_DESC);
    const expectedGrade = row.EXPECTED_MATERIAL_CD?.trim();
    const expectedLabel = formatGradeLabel(expectedGrade, row.EXPECTED_MATERIAL_DESC);

    if (!row.TOTAL_CNT) {
        if ((row.SUGGESTION_MATERIAL_CNT ?? 0) > 0 && expectedGrade) {
            return [
                `No stock on this bin now (${slotCode}).`,
                `This bin on KBAS010: ${expectedGrade} is assigned to ${slotCode} → ${slotLabel}.`,
                expectedLabel !== expectedGrade ? `Grade spec: ${expectedLabel}` : ''
            ]
                .filter(Boolean)
                .join('\n');
        }
        return undefined;
    }

    const lines: string[] = [];

    if ((row.INV_MATERIAL_DISTINCT_CNT ?? 0) > 1) {
        lines.push(
            `On the rack: ${row.TOTAL_CNT} ${lotWord} — more than one different grade on this bin.`
        );
    } else if (onRackGrade) {
        lines.push(`On the rack: ${row.TOTAL_CNT} ${lotWord} of ${onRackLabel}.`);
        lines.push(
            `${onRackGrade} on KBAS010: Suggestion Bin.lo = ${formatSuggestionLo(row, true)}.`
        );
    }

    if ((row.SUGGESTION_MATERIAL_CNT ?? 0) > 0 && expectedGrade) {
        lines.push(
            `This bin on KBAS010: ${expectedGrade} is assigned to ${slotCode} → ${slotLabel}.`
        );
        if (row.EXPECTED_MATERIAL_DESC?.trim()) {
            lines.push(`Assigned grade spec: ${expectedLabel}.`);
        }
    } else {
        lines.push(
            `This bin on KBAS010: no grade assigned to ${slotCode} (shows FREE on screen).`
        );
    }

    if (row.FLAG2 === 'N') {
        lines.push('Wrong item: material on rack does not match bin assignment on material list.');
    }
    if (row.FLAG1 === 'N') {
        lines.push(
            `Short length: shortest lot ${row.MIN_BALANCE_LENGTH ?? '—'} < required ${row.REF_MATERIAL_STD_LENGTH ?? '—'}.`
        );
    }

    return lines.length ? lines.join('\n') : undefined;
}

export function isM2bEmptyRackSlot(row: Pick<M2bVerificationRow, 'TOTAL_CNT' | 'SUGGESTION_MATERIAL_CNT'>): boolean {
    const assigned = row.SUGGESTION_MATERIAL_CNT ?? 0;
    return !row.TOTAL_CNT || assigned === 0;
}

function normalizeRow(raw: Record<string, unknown>, index: number): M2bVerificationRow {
    return {
        id: index + 1,
        BIN_LOC: String(raw.BIN_LOC ?? raw.bin_loc ?? ''),
        SUGGESTION_BIN_DESC: String(
            raw.SUGGESTION_BIN_DESC ??
                raw.suggestion_bin_desc ??
                raw.BIN_LOCATION_DESC ??
                raw.bin_location_desc ??
                ''
        ),
        TOTAL_CNT: Number(raw.TOTAL_CNT ?? raw.total_cnt ?? 0),
        FLAG1: String(raw.FLAG1 ?? raw.flag1 ?? 'Y'),
        FLAG2: String(raw.FLAG2 ?? raw.flag2 ?? 'Y'),
        CDNAME: String(raw.CDNAME ?? raw.cdname ?? 'Unknown'),
        SUGGESTION_MATERIAL_CNT: Number(raw.SUGGESTION_MATERIAL_CNT ?? raw.suggestion_material_cnt ?? 0),
        EXPECTED_MATERIAL_CD: raw.EXPECTED_MATERIAL_CD != null ? String(raw.EXPECTED_MATERIAL_CD) : undefined,
        ACTUAL_MATERIAL_CD: raw.ACTUAL_MATERIAL_CD != null ? String(raw.ACTUAL_MATERIAL_CD) : undefined,
        ACTUAL_MATERIAL_DESC:
            raw.ACTUAL_MATERIAL_DESC != null ? String(raw.ACTUAL_MATERIAL_DESC) : undefined,
        EXPECTED_MATERIAL_DESC:
            raw.EXPECTED_MATERIAL_DESC != null ? String(raw.EXPECTED_MATERIAL_DESC) : undefined,
        ACTUAL_SUGGESTION_BIN_CD:
            raw.ACTUAL_SUGGESTION_BIN_CD != null ? String(raw.ACTUAL_SUGGESTION_BIN_CD) : undefined,
        ACTUAL_SUGGESTION_BIN_DESC:
            raw.ACTUAL_SUGGESTION_BIN_DESC != null ? String(raw.ACTUAL_SUGGESTION_BIN_DESC) : undefined,
        INV_MATERIAL_DISTINCT_CNT: Number(
            raw.INV_MATERIAL_DISTINCT_CNT ?? raw.inv_material_distinct_cnt ?? 0
        ),
        MIN_BALANCE_LENGTH:
            raw.MIN_BALANCE_LENGTH != null && raw.MIN_BALANCE_LENGTH !== ''
                ? Number(raw.MIN_BALANCE_LENGTH)
                : null,
        REF_MATERIAL_STD_LENGTH:
            raw.REF_MATERIAL_STD_LENGTH != null && raw.REF_MATERIAL_STD_LENGTH !== ''
                ? Number(raw.REF_MATERIAL_STD_LENGTH)
                : null,
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
