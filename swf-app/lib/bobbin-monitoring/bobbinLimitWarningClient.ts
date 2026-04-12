import {
    BOBBIN_DEFAULT_CYCLE_LIMIT,
    BOBBIN_DEFAULT_LIFESPAN_LIMIT_DAYS,
    BOBBIN_DEFAULT_LIFESPAN_WARNING_PCT,
    BOBBIN_DEFAULT_USAGE_WARNING_PCT
} from './constants';
import { bobbinNextApiPath, bobbinSwfApiPath } from './bobbinMonitoringDbTarget';
import { parseBobbinLimitWarningRow } from './parseBobbinLimitRow';

export type BobbinLimitWarningResult = {
    cycleLimit: number;
    cycleWarningPct: number;
    /** Max lifespan from TB_BOBBIN_LIMIT, **days** (BobbinLifeSpanLimit). */
    lifespanLimitDays: number;
    lifespanWarningPct: number;
    /** True when a TB_BOBBIN_LIMIT row was read and cycle fields parsed. */
    fromApi: boolean;
};

export type BobbinLimitWarningSavePayload = {
    bobbinCycleLimit: number;
    bobbinLifeSpanLimit: number;
    bobbinCycleWarning: number;
    bobbinLifespanWarning: number;
};

function directApiBase(): string {
    if (typeof process === 'undefined') return '';
    const v = process.env.NEXT_PUBLIC_SWF_API_URL;
    return v ? String(v).replace(/\/$/, '') : '';
}

function fallback(): BobbinLimitWarningResult {
    return {
        cycleLimit: BOBBIN_DEFAULT_CYCLE_LIMIT,
        cycleWarningPct: BOBBIN_DEFAULT_USAGE_WARNING_PCT,
        lifespanLimitDays: BOBBIN_DEFAULT_LIFESPAN_LIMIT_DAYS,
        lifespanWarningPct: BOBBIN_DEFAULT_LIFESPAN_WARNING_PCT,
        fromApi: false
    };
}

export type FetchBobbinLimitWarningOptions = {
    /** Append a cache-busting query param (use after POST so the next read is not a stale cached response). */
    cacheBust?: boolean;
};

/**
 * Loads limits from swf-api (latest TB_BOBBIN_LIMIT row).
 */
export async function fetchBobbinLimitWarning(
    options?: FetchBobbinLimitWarningOptions
): Promise<BobbinLimitWarningResult> {
    const base = directApiBase();
    const qs = options?.cacheBust ? `?_=${Date.now()}` : '';
    const path = bobbinSwfApiPath('limitwarning');
    const url = base ? `${base}${path}${qs}` : `${bobbinNextApiPath('limitwarning')}${qs}`;

    let res: Response;
    try {
        res = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    } catch {
        return fallback();
    }

    let body: unknown;
    try {
        body = await res.json();
    } catch {
        body = null;
    }

    if (!res.ok) {
        return fallback();
    }

    const rows = Array.isArray(body) ? body : [];
    const parsed = rows.length > 0 ? parseBobbinLimitWarningRow(rows[0]) : null;
    if (!parsed) {
        return fallback();
    }

    return {
        cycleLimit: parsed.cycleLimit,
        cycleWarningPct: parsed.cycleWarningPct,
        lifespanLimitDays: parsed.lifespanLimitDays,
        lifespanWarningPct: parsed.lifespanWarningPct,
        fromApi: true
    };
}

/**
 * Inserts a new TB_BOBBIN_LIMIT row via sp_Bobbin_Limit_Warning_Update.
 */
export async function saveBobbinLimitWarning(
    payload: BobbinLimitWarningSavePayload
): Promise<{ ok: true } | { ok: false; message: string }> {
    const base = directApiBase();
    const path = bobbinSwfApiPath('limitwarning');
    const url = base ? `${base}${path}` : bobbinNextApiPath('limitwarning');

    let res: Response;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            credentials: 'omit',
            body: JSON.stringify(payload)
        });
    } catch {
        return { ok: false, message: 'Cannot reach the data service.' };
    }

    let body: unknown;
    try {
        body = await res.json();
    } catch {
        body = null;
    }

    if (!res.ok) {
        const msg =
            body &&
            typeof body === 'object' &&
            body !== null &&
            'error' in body &&
            typeof (body as { error: unknown }).error === 'string'
                ? (body as { error: string }).error
                : `Save failed (${res.status})`;
        return { ok: false, message: msg };
    }

    return { ok: true };
}
