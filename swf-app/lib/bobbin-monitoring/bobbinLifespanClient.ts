import { bobbinNextApiPath, bobbinSwfApiPath } from './bobbinMonitoringDbTarget';
import { extractFirstCycleDateFromRows } from './bobbinLifespan';

function directApiBase(): string {
    if (typeof process === 'undefined') return '';
    const v = process.env.NEXT_PUBLIC_SWF_API_URL;
    return v ? String(v).replace(/\/$/, '') : '';
}

/**
 * Fetches bobbin first-cycle date from swf-api. Never throws; returns null on failure.
 */
export async function fetchBobbinLifespanStartDate(lcCd: string): Promise<Date | null> {
    const q = lcCd.trim();
    if (!q) return null;

    const base = directApiBase();
    const qs = new URLSearchParams({ lc_cd: q }).toString();
    const path = bobbinSwfApiPath('bobbinlifespan');
    const url = base ? `${base}${path}?${qs}` : `${bobbinNextApiPath('bobbinlifespan')}?${qs}`;

    try {
        const res = await fetch(url, { cache: 'no-store', credentials: 'omit' });
        if (!res.ok) return null;
        const body: unknown = await res.json().catch(() => null);
        const rows = Array.isArray(body) ? body : [];
        return extractFirstCycleDateFromRows(rows);
    } catch {
        return null;
    }
}
