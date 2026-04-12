import type { BobbinDetails, BobbinHistoryRow, BobbinSummary } from './types';
import { bobbinNextApiPath, bobbinSwfApiPath } from './bobbinMonitoringDbTarget';
import { extractLcCdFromBobbinCode } from './extractLcCd';
import { mapBobbincycleRows } from './mapBobbincycle';

export type BobbinCycleApiOk = {
    found: true;
    lcCd: string;
    scannedCode: string;
    summary: BobbinSummary;
    details: BobbinDetails;
    history: BobbinHistoryRow[];
};

export type BobbinCycleApiNotFound = {
    found: false;
    lcCd: string;
    scannedCode: string;
};

export type BobbinCycleApiError = {
    error: string;
    lcCd?: string;
};

type ClientResult =
    | { ok: true; notFound: true; scannedCode: string; lcCd: string }
    | { ok: true; notFound: false; data: BobbinCycleApiOk }
    | { ok: false; status: number; message: string };

function directApiBase(): string {
    if (typeof process === 'undefined') return '';
    const v = process.env.NEXT_PUBLIC_SWF_API_URL;
    return v ? String(v).replace(/\/$/, '') : '';
}

function shapeFromRows(trimmed: string, lcCd: string, rows: unknown[]): ClientResult {
    if (!Array.isArray(rows) || rows.length === 0) {
        return {
            ok: true,
            notFound: true as const,
            scannedCode: trimmed,
            lcCd
        };
    }
    const mapped = mapBobbincycleRows(rows, trimmed, lcCd);
    if (!mapped) {
        return {
            ok: true,
            notFound: true as const,
            scannedCode: trimmed,
            lcCd
        };
    }
    return {
        ok: true,
        notFound: false as const,
        data: {
            found: true,
            lcCd,
            scannedCode: trimmed,
            summary: mapped.summary,
            details: mapped.details,
            history: mapped.history
        }
    };
}

async function parseProxyResponse(res: Response, trimmed: string): Promise<ClientResult> {
    let json: unknown;
    try {
        json = await res.json();
    } catch {
        json = null;
    }

    if (!res.ok) {
        const msg =
            json &&
            typeof json === 'object' &&
            json !== null &&
            'error' in json &&
            typeof (json as { error: unknown }).error === 'string'
                ? (json as { error: string }).error
                : `Request failed (${res.status})`;
        return { ok: false, status: res.status, message: msg };
    }

    const o = json as Record<string, unknown>;
    if (o.found === false) {
        return {
            ok: true,
            notFound: true as const,
            scannedCode: String(o.scannedCode ?? trimmed),
            lcCd: String(o.lcCd ?? '')
        };
    }

    if (o.found === true && o.summary && o.details && Array.isArray(o.history)) {
        return {
            ok: true,
            notFound: false as const,
            data: o as unknown as BobbinCycleApiOk
        };
    }

    return { ok: false, status: res.status, message: 'Unexpected response from server' };
}

async function fetchViaDirectSwfApi(trimmed: string): Promise<ClientResult> {
    const lcCd = extractLcCdFromBobbinCode(trimmed);
    if (!lcCd) {
        return {
            ok: false,
            status: 400,
            message: 'Bobbin code needs digits for lookup.'
        };
    }

    const params = new URLSearchParams({ lc_cd: lcCd });
    const base = directApiBase();
    const url = `${base}${bobbinSwfApiPath('bobbincycle')}?${params.toString()}`;

    let res: Response;
    try {
        res = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    } catch {
        return {
            ok: false,
            status: 502,
            message: 'Cannot reach the data service. Check the network or server.'
        };
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
                : `Service returned ${res.status}`;
        return { ok: false, status: res.status >= 400 ? res.status : 502, message: msg };
    }

    const rows = Array.isArray(body) ? body : [];
    return shapeFromRows(trimmed, lcCd, rows);
}

/**
 * Loads bobbin cycle data.
 * If `NEXT_PUBLIC_SWF_API_URL` is set (e.g. http://127.0.0.1:3200), calls swf-api from the browser
 * and skips the Next.js proxy (one less hop, usually faster).
 * Otherwise uses `/api/bobbin/bobbincycle`.
 */
export async function fetchBobbinCycle(scannedCode: string): Promise<ClientResult> {
    const trimmed = scannedCode.trim();

    if (directApiBase()) {
        return fetchViaDirectSwfApi(trimmed);
    }

    const apiPath = bobbinNextApiPath('bobbincycle');
    const res = await fetch(`${apiPath}?code=${encodeURIComponent(trimmed)}`, {
        cache: 'no-store'
    });

    return parseProxyResponse(res, trimmed);
}
