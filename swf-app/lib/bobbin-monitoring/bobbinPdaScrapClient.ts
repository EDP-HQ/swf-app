import { bobbinNextApiPath, getBobbinDbTarget, type BobbinDbTarget } from './bobbinMonitoringDbTarget';

export type BobbinPdaScrapResult = { ok: true } | { ok: false; message: string; status: number };

/** Snapshot of the outgoing browser → Next.js scrap request (for debugging / dev UI). */
export type PdaScrapRequestMeta = {
    method: 'POST';
    path: string;
    url: string;
    headers: Record<string, string>;
    body: Record<string, string>;
};

/**
 * POST USP_SFC_PDA_SCRAP_I10 via Next proxy (local or sfcwr per active DB target).
 * @param fullBobbinCode Entire scanned/typed bobbin code (sent as `lc_cd` / SQL @LC_CD). Unlike bobbincycle, this is not reduced to last 4 digits.
 */
export async function postBobbinPdaScrap(
    fullBobbinCode: string,
    empCd: string,
    options?: {
        target?: BobbinDbTarget;
        /** Invoked immediately before fetch (e.g. show headers in developer UI). */
        onRequestMeta?: (meta: PdaScrapRequestMeta) => void;
    }
): Promise<BobbinPdaScrapResult> {
    const target = options?.target ?? getBobbinDbTarget();
    const path = bobbinNextApiPath('pdascrap', target);
    const body: Record<string, string> = {
        lc_cd: fullBobbinCode.trim(),
        emp_cd: empCd.trim()
    };

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json'
    };
    const origin =
        typeof window !== 'undefined' && typeof window.location?.origin === 'string'
            ? window.location.origin
            : '';
    const url = origin ? `${origin}${path}` : path;

    options?.onRequestMeta?.({
        method: 'POST',
        path,
        url,
        headers: { ...headers },
        body: { ...body }
    });

    let res: Response;
    try {
        res = await fetch(path, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
    } catch {
        return { ok: false, message: 'Network error calling scrap API.', status: 0 };
    }

    let data: unknown;
    try {
        data = await res.json();
    } catch {
        data = null;
    }

    if (!res.ok) {
        const msg =
            data &&
            typeof data === 'object' &&
            data !== null &&
            'error' in data &&
            typeof (data as { error: unknown }).error === 'string'
                ? (data as { error: string }).error
                : `Scrap request failed (${res.status})`;
        return { ok: false, message: msg, status: res.status };
    }

    if (data && typeof data === 'object' && 'ok' in data && (data as { ok: unknown }).ok === true) {
        return { ok: true };
    }

    return { ok: true };
}
