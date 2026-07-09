import { mergeRollerDashboard } from './mergeDashboard';
import { applyComponentsToMachines } from './mergeComponents';
import { fetchComponents } from './componentsClient';
import { asRecordArray, rowNum, rowStr } from './parseRows';

import { getRollerDbTarget, rollerNextApiPath, rollerSwfApiPath, type RollerApiEndpoint } from './rollerMonitoringDbTarget';

import type { RollerDashboardData } from './types';

export type RollerHistoryRow = {
    rollerId: string;
    binLocation: string;
    replaceDt: string;
    dismantleDt: string;
    runtimeLimitHours: number;
    runtimeHours: number;
    isActive: boolean;
};



const DEFAULT_SWF_API = 'http://127.0.0.1:3200';



/** Browser → swf-api when set; otherwise Next.js `/api/roller/*` proxy (same as before). */

function directApiBase(): string {

    if (typeof process === 'undefined') return '';

    const v = process.env.NEXT_PUBLIC_SWF_API_URL;

    return v ? String(v).replace(/\/$/, '') : '';

}



function resolveRollerUrl(endpoint: RollerApiEndpoint, target = getRollerDbTarget()): string {

    const direct = directApiBase();

    if (direct) {

        return `${direct}${rollerSwfApiPath(endpoint, target)}`;

    }

    return rollerNextApiPath(endpoint, target);

}



function parseErrorMessage(body: unknown, status: number): string {

    if (

        body &&

        typeof body === 'object' &&

        body !== null &&

        'error' in body &&

        typeof (body as { error: unknown }).error === 'string'

    ) {

        return (body as { error: string }).error;

    }

    return `API returned ${status}`;

}



async function fetchRollerEndpoint<T = unknown>(

    endpoint: RollerApiEndpoint,

    init?: RequestInit,

    target = getRollerDbTarget()

): Promise<T> {

    const url = resolveRollerUrl(endpoint, target);



    let res: Response;

    try {

        res = await fetch(url, {

            cache: 'no-store',

            headers: { Accept: 'application/json', ...(init?.headers || {}) },

            ...init

        });

    } catch (e) {

        const direct = directApiBase();

        const hint = direct

            ? `Cannot reach swf-api at ${direct}. Start swf-api (port 3200).`

            : 'Cannot reach API. Start swf-api and swf-app, or set NEXT_PUBLIC_SWF_API_URL in .env.local.';

        const detail = e instanceof Error ? e.message : 'Network error';

        throw new Error(`${hint} (${detail})`);

    }



    let body: unknown = null;

    try {

        body = await res.json();

    } catch {

        body = null;

    }



    if (!res.ok) {

        throw new Error(parseErrorMessage(body, res.status));

    }



    return body as T;

}



export async function fetchRollerDashboard(target = getRollerDbTarget()): Promise<RollerDashboardData> {

    const [list, onoff, activeList, currentRuntime, history, components] = await Promise.all([

        fetchRollerEndpoint('list', undefined, target),

        fetchRollerEndpoint('onoff', undefined, target),

        fetchRollerEndpoint('activelist', undefined, target),

        fetchRollerEndpoint('currentruntime', undefined, target),

        fetchRollerEndpoint('history', undefined, target),

        fetchComponents(target).catch(() => [])

    ]);



    const dashboard = mergeRollerDashboard({ list, onoff, activeList, currentRuntime, history });

    return {

        ...dashboard,

        machines: applyComponentsToMachines(dashboard.machines, components)

    };

}



export async function updateRollerRuntimeLimit(

    rollerId: string,

    runtimeLimit: number,

    target = getRollerDbTarget()

): Promise<void> {

    await fetchRollerEndpoint(

        'updateruntimelimit',

        {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ params: { RollerID: rollerId, RuntimeLimit: runtimeLimit } })

        },

        target

    );

}



export async function batchUpdateRollerRuntimeLimits(

    rollerIds: string[],

    runtimeLimit: number,

    target = getRollerDbTarget()

): Promise<void> {

    await fetchRollerEndpoint(

        'batchupdateruntimelimit',

        {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ params: { RollerIDs: rollerIds, RuntimeLimit: runtimeLimit } })

        },

        target

    );

}



export async function updateRollerRuntime(
    runtimeSec: number,
    target = getRollerDbTarget(),
    options: { rollerId?: string; binLocation?: string }
): Promise<void> {
    if (!options.rollerId && !options.binLocation) {
        throw new Error('RollerId or bin location required');
    }

    await fetchRollerEndpoint(
        'updateruntime',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                params: {
                    RuntimeSec: runtimeSec,
                    ...(options.rollerId ? { RollerID: options.rollerId } : {}),
                    ...(options.binLocation ? { BinLocation: options.binLocation } : {})
                }
            })
        },
        target
    );
}

function rollerHistoryFromRow(row: Record<string, unknown>): RollerHistoryRow {
    const runtimeSec = rowNum(row, 'RUNTIME_SEC');
    return {
        rollerId: rowStr(row, 'ROLLER_ID'),
        binLocation: rowStr(row, 'BIN_LOCATION_CD'),
        replaceDt: rowStr(row, 'Start_DT', 'START_DT'),
        dismantleDt: rowStr(row, 'REPLACE_DT'),
        runtimeLimitHours: rowNum(row, 'RUNTIME_LIMIT_HOUR'),
        runtimeHours: runtimeSec / 3600,
        isActive: false
    };
}

export async function fetchRollerHistory(
    binLocation: string,
    target = getRollerDbTarget()
): Promise<RollerHistoryRow[]> {
    const body = await fetchRollerEndpoint<unknown>('history', undefined, target);
    const bin = binLocation.trim();
    return asRecordArray(body)
        .filter((row) => rowStr(row, 'BIN_LOCATION_CD') === bin)
        .map(rollerHistoryFromRow)
        .sort((a, b) => (b.replaceDt || '').localeCompare(a.replaceDt || ''));
}

export async function replaceRoller(binLocation: string, target = getRollerDbTarget()): Promise<void> {

    await fetchRollerEndpoint(

        'replace',

        {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ params: { BinLocation: binLocation } })

        },

        target

    );

}



/** Exposed for diagnostics in UI. */

export function rollerApiMode(): 'direct' | 'proxy' {

    return directApiBase() ? 'direct' : 'proxy';

}



export function rollerApiBaseForDisplay(): string {

    return directApiBase() || DEFAULT_SWF_API;

}


