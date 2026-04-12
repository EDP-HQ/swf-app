import type { BobbinLifespanInfo } from './types';

type Row = Record<string, unknown>;

function upperKeys(row: Row): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
        out[k.toUpperCase()] = v;
    }
    return out;
}

function parseFlexibleDate(value: unknown): Date | null {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'number') {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === 'string') {
        const t = value.trim();
        if (!t) return null;
        const d = new Date(t);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
}

/** Prefer known column names from BobbinStartDate / SP result. */
const DATE_KEY_PREFS = [
    'FIRST_CYCLE_DT',
    'FIRST_DT',
    'START_DATE',
    'START_DT',
    'BOBIN_START',
    'BOBBIN_START',
    'MIN_DT',
    'MIN_DATE',
    'FIRST_PRODUCTION_DT',
    'CRT_DT',
    'REG_DT',
    'DATE'
];

/**
 * Reads first-cycle start date from bobbinlifespan SP recordset (first row).
 */
export function extractFirstCycleDateFromRows(rows: unknown[]): Date | null {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0] as Row;
    const U = upperKeys(row);

    for (const k of DATE_KEY_PREFS) {
        const d = parseFlexibleDate(U[k.toUpperCase()]);
        if (d) return d;
    }

    for (const v of Object.values(U)) {
        const d = parseFlexibleDate(v);
        if (d) return d;
    }
    return null;
}

function startOfLocalDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Calendar difference from `from` to `to` (local date), non-negative.
 */
export function diffCalendarYearsMonthsDays(from: Date, to: Date): { years: number; months: number; days: number } {
    const a = startOfLocalDay(from);
    const b = startOfLocalDay(to);
    if (b < a) {
        return { years: 0, months: 0, days: 0 };
    }

    let years = b.getFullYear() - a.getFullYear();
    let months = b.getMonth() - a.getMonth();
    let days = b.getDate() - a.getDate();

    if (days < 0) {
        months -= 1;
        const prevMonthLast = new Date(b.getFullYear(), b.getMonth(), 0);
        days += prevMonthLast.getDate();
    }
    if (months < 0) {
        years -= 1;
        months += 12;
    }

    return { years, months, days };
}

export function buildLifespanInfo(start: Date | null, now: Date = new Date()): BobbinLifespanInfo {
    if (!start) {
        return {
            firstCycleDateLabel: '—',
            years: 0,
            months: 0,
            days: 0,
            hasStartDate: false
        };
    }

    const { years, months, days } = diffCalendarYearsMonthsDays(start, now);
    const firstCycleDateLabel = start.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    return {
        firstCycleDateLabel,
        years,
        months,
        days,
        hasStartDate: true
    };
}
