import { bobbinNextApiPath, getBobbinDbTarget, type BobbinDbTarget } from './bobbinMonitoringDbTarget';

export type PdaLoginResult = {
    empCd: string;
    empName: string | null;
    permId: string | number | null;
};

/**
 * POST → Next `/api/bobbin/pdalogin` or `/api/bobbin/sfcwr/pdalogin` per active DB target.
 */
export async function pdaLogin(
    empCd: string,
    options?: { lang?: string; target?: BobbinDbTarget }
): Promise<PdaLoginResult> {
    const target = options?.target ?? getBobbinDbTarget();
    const path = bobbinNextApiPath('pdalogin', target);
    const body: Record<string, string> = {
        emp_cd: empCd.trim()
    };
    if (options?.lang?.trim()) {
        body.lang = options.lang.trim();
    }

    const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
    });

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
                : `Login failed (${res.status})`;
        throw new Error(msg);
    }

    if (!data || typeof data !== 'object' || !('ok' in data) || (data as { ok: unknown }).ok !== true) {
        throw new Error('Unexpected login response');
    }

    const d = data as { empCd?: unknown; empName?: unknown; permId?: unknown };
    const permId = d.permId;
    const permIdNorm =
        typeof permId === 'string' || typeof permId === 'number' ? permId : null;
    return {
        empCd: typeof d.empCd === 'string' ? d.empCd : empCd.trim(),
        empName: typeof d.empName === 'string' ? d.empName : null,
        permId: permIdNorm
    };
}
