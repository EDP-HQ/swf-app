/**
 * Maps a row from TB_BOBBIN_LIMIT (sp_Bobbin_Limit_Warning_Select) to UI numbers.
 * BobbinLifeSpanLimit is stored in **days**; cycle limit/warnings unchanged.
 */

import { BOBBIN_DEFAULT_LIFESPAN_LIMIT_DAYS, BOBBIN_DEFAULT_LIFESPAN_WARNING_PCT } from './constants';

const CYCLE_LIMIT_KEYS = [
    'BobbinCycleLimit',
    'CYCLE_LIMIT',
    'MAX_CYCLE',
    'BOBBIN_CYCLE_LIMIT',
    'LIMIT_CYCLE',
    'MAXCYCLE',
    'CYCLELIMIT',
    'LIMIT',
    'LC_LIMIT'
];

const CYCLE_WARNING_KEYS = [
    'BobbinCycleWarning',
    'WARNING_PCT',
    'USAGE_WARNING_PCT',
    'WARN_PCT',
    'WARNING_PERCENT',
    'USAGEWARNINGPCT',
    'WARNINGPCT',
    'WARN_PERCENT'
];

/** BobbinLifeSpanLimit column: integer **days** in database. */
const LIFESPAN_LIMIT_DAY_KEYS = ['BobbinLifeSpanLimit', 'BobbinLifespanLimit', 'LIFESPAN_LIMIT_DAYS', 'LIFESPANLIMITDAYS'];

const LIFESPAN_WARNING_KEYS = [
    'BobbinLifespanWarning',
    'LIFESPAN_WARNING_PCT',
    'LIFESPANWARNING',
    'LIFESPAN_WARN_PCT'
];

function rowMap(row: Record<string, unknown>): Map<string, unknown> {
    const m = new Map<string, unknown>();
    for (const [k, v] of Object.entries(row)) {
        m.set(k.replace(/\s/g, '').toLowerCase(), v);
    }
    return m;
}

function pickPositiveInt(row: Record<string, unknown>, keys: string[]): number | null {
    const m = rowMap(row);
    for (const key of keys) {
        const v = m.get(key.toLowerCase());
        const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseInt(String(v).trim(), 10) : NaN;
        if (Number.isInteger(n) && n >= 1) return n;
    }
    return null;
}

function pickPct1to100(row: Record<string, unknown>, keys: string[]): number | null {
    const m = rowMap(row);
    for (const key of keys) {
        const v = m.get(key.toLowerCase());
        const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(String(v).trim()) : NaN;
        if (Number.isFinite(n) && n >= 1 && n <= 100) return Math.round(n);
    }
    return null;
}

export type BobbinLimitWarningParsed = {
    cycleLimit: number;
    cycleWarningPct: number;
    /** Max lifespan from DB, in **days**. */
    lifespanLimitDays: number;
    lifespanWarningPct: number;
};

/**
 * Parses first recordset row from sp_Bobbin_Limit_Warning_Select.
 * Returns null if cycle limit / cycle warning cannot be read.
 */
export function parseBobbinLimitWarningRow(row: unknown): BobbinLimitWarningParsed | null {
    if (!row || typeof row !== 'object') return null;
    const r = row as Record<string, unknown>;
    const cycleLimit = pickPositiveInt(r, CYCLE_LIMIT_KEYS);
    const cycleWarningPct = pickPct1to100(r, CYCLE_WARNING_KEYS);
    if (cycleLimit == null || cycleWarningPct == null) return null;

    const lifespanLimitDays = pickPositiveInt(r, LIFESPAN_LIMIT_DAY_KEYS);
    const lifespanWarningPct = pickPct1to100(r, LIFESPAN_WARNING_KEYS);

    return {
        cycleLimit,
        cycleWarningPct,
        lifespanLimitDays: lifespanLimitDays ?? BOBBIN_DEFAULT_LIFESPAN_LIMIT_DAYS,
        lifespanWarningPct: lifespanWarningPct ?? BOBBIN_DEFAULT_LIFESPAN_WARNING_PCT
    };
}
