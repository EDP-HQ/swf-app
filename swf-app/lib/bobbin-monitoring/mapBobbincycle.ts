import { BOBBIN_GUBUN_CYCLE } from './constants';
import type { BobbinDetails, BobbinHistoryRow, BobbinSummary } from './types';

type Row = Record<string, unknown>;

function upperKeys(row: Row): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
        out[k.toUpperCase()] = v;
    }
    return out;
}

/** GUBUN from row (SQL column name may vary in casing). */
function getGubun(U: Record<string, unknown>): string {
    const v = U.GUBUN;
    if (v == null || v === '') return '';
    return String(v).trim();
}

function isProductionCycleRow(row: Row): boolean {
    return getGubun(upperKeys(row)).toUpperCase() === BOBBIN_GUBUN_CYCLE.toUpperCase();
}

function pickString(U: Record<string, unknown>, keys: string[]): string {
    for (const k of keys) {
        const v = U[k.toUpperCase()];
        if (v != null && v !== '') return String(v).trim();
    }
    return '—';
}

function pickNumber(U: Record<string, unknown>, keys: string[]): number | undefined {
    for (const k of keys) {
        const v = U[k.toUpperCase()];
        if (v == null || v === '') continue;
        const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
        if (!Number.isNaN(n)) return n;
    }
    return undefined;
}

function deriveStatus(
    current: number,
    max: number,
    U: Record<string, unknown>
): BobbinSummary['status'] {
    const statusRaw = pickString(U, ['STATUS', 'STAT', 'USE_YN', 'USABLE', 'STOP_YN', 'DEL_YN']).toUpperCase();
    if (
        statusRaw.includes('EXP') ||
        statusRaw === 'N' ||
        statusRaw.includes('STOP') ||
        statusRaw.includes('VOID')
    ) {
        return 'Expired / Not Usable';
    }
    if (max > 0) {
        if (current >= max) return 'Reached Limit';
        if (current / max >= 0.8) return 'Near Limit';
    }
    return 'Active';
}

/** Count of rows where GUBUN = PRODUCTION — each counts as one cycle. */
export function countProductionCyclesFromRows(rows: unknown[]): number {
    if (!Array.isArray(rows)) return 0;
    return rows.filter((r) => isProductionCycleRow(r as Row)).length;
}

/**
 * Maps USP_SFC_KPRD010_R10 recordset into UI models.
 * - Current cycle count = number of rows with GUBUN === 'PRODUCTION' (see BOBBIN_GUBUN_CYCLE).
 * - Max / remaining: from first row if those columns exist, else 0 / derived.
 */
export function mapBobbincycleRows(
    rows: unknown[],
    scannedCode: string,
    lcCd: string
): { summary: BobbinSummary; details: BobbinDetails; history: BobbinHistoryRow[] } | null {
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const first = rows[0] as Row;
    const U = upperKeys(first);

    const current = countProductionCyclesFromRows(rows);

    let max =
        pickNumber(U, [
            'MAX_CYCLE',
            'MAX_CNT',
            'CYCLE_LIMIT',
            'LIMIT_CNT',
            'LMT_CYCLE',
            'STD_CYCLE',
            'ALLOW_CYCLE',
            'MAX_USE'
        ]) ?? 0;

    let remaining = pickNumber(U, ['REMAIN', 'REMAIN_CNT', 'REST_CNT', 'BAL_CNT', 'LEFT_CNT']);

    if (remaining === undefined && max > 0) {
        remaining = Math.max(0, max - current);
    }
    if (remaining === undefined) remaining = 0;

    const status = deriveStatus(current, max, U);

    const summary: BobbinSummary = {
        bobbinCode: scannedCode.trim(),
        currentCycleCount: current,
        maxCycleLimit: max,
        remainingCycles: remaining,
        status
    };

    const details: BobbinDetails = {
        bobbinType: pickString(U, ['BOBBIN_TYPE', 'TYPE', 'LC_TYPE', 'PROD_TYPE', 'ITEM_TYPE']),
        machineLine: pickString(U, ['LINE', 'LINE_CD', 'MCHN_LINE', 'MCN_CD', 'MACHINE', 'EQ_CD']),
        lastScanDateTime: pickString(U, [
            'LAST_SCAN_DT',
            'SCAN_DT',
            'INSP_DT',
            'CHK_DT',
            'UPD_DT',
            'WORK_DT',
            'DT',
            'DATE'
        ]),
        lastOperator: pickString(U, ['LAST_OP', 'OP_CD', 'USER_ID', 'EMP_NO', 'OPERATOR', 'INS_USER']),
        createdDate: pickString(U, ['REG_DT', 'CRT_DT', 'CREATE_DT', 'INS_DT', 'OPEN_DT']),
        remarks: pickString(U, ['RMK', 'REMARK', 'RMARK', 'NOTE', 'DESC', 'DESCRIPTION'])
    };

    let productionSoFar = 0;
    const history: BobbinHistoryRow[] = rows.map((r, i) => {
        const raw = r as Row;
        const ru = upperKeys(raw);
        const gubun = getGubun(ru);
        const isProd = gubun.toUpperCase() === BOBBIN_GUBUN_CYCLE.toUpperCase();

        const cycleBefore = productionSoFar;
        if (isProd) productionSoFar += 1;
        const cycleAfter = productionSoFar;

        const dt = pickString(ru, [
            'SCAN_DT',
            'WORK_DT',
            'INSP_DT',
            'DT',
            'DATE',
            'UPD_DT',
            'REG_DT',
            'PROD_DT',
            'CRT_DT'
        ]);

        return {
            id: String(i + 1),
            dateTime: dt,
            bobbinCode: pickString(ru, ['LC_CD', 'BOBBIN_CD', 'BOBBIN_CODE']) || lcCd,
            action: gubun || '—',
            cycleBefore,
            cycleAfter,
            operator: pickString(ru, ['OP_CD', 'USER_ID', 'EMP_NO', 'OPERATOR']),
            machineLine: pickString(ru, ['LINE', 'LINE_CD', 'MCHN_LINE', 'MCN_CD'])
        };
    });

    return { summary, details, history };
}
