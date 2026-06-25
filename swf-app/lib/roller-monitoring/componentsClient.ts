import { getRollerDbTarget, type RollerDbTarget } from './rollerMonitoringDbTarget';
import { fixedPartKeyToSeq } from './machineParts';
import type { MachineFixedPartKey } from './types';

export type ComponentsApiEndpoint = 'select' | 'replace' | 'updateruntime' | 'updateruntimelimit';

const DEFAULT_SWF_API = 'http://127.0.0.1:3200';

function directApiBase(): string {
    if (typeof process === 'undefined') return '';
    const v = process.env.NEXT_PUBLIC_SWF_API_URL;
    return v ? String(v).replace(/\/$/, '') : '';
}

export function componentsSwfApiPath(
    endpoint: ComponentsApiEndpoint,
    target: RollerDbTarget = getRollerDbTarget()
): string {
    return target === 'production' ? `/components/sfcwr/${endpoint}` : `/components/${endpoint}`;
}

export function componentsNextApiPath(
    endpoint: ComponentsApiEndpoint,
    target: RollerDbTarget = getRollerDbTarget()
): string {
    return target === 'production' ? `/api/components/sfcwr/${endpoint}` : `/api/components/${endpoint}`;
}

function resolveComponentsUrl(endpoint: ComponentsApiEndpoint, target = getRollerDbTarget()): string {
    const direct = directApiBase();
    if (direct) {
        return `${direct}${componentsSwfApiPath(endpoint, target)}`;
    }
    return componentsNextApiPath(endpoint, target);
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

export async function fetchComponents(
    target = getRollerDbTarget(),
    query?: { company?: string; factory?: string; machineNm?: string }
): Promise<unknown> {
    const params = new URLSearchParams();
    if (query?.company) params.set('company', query.company);
    if (query?.factory) params.set('factory', query.factory);
    if (query?.machineNm) params.set('machine_nm', query.machineNm);

    const qs = params.toString();
    const url = `${resolveComponentsUrl('select', target)}${qs ? `?${qs}` : ''}`;

    let res: Response;
    try {
        res = await fetch(url, {
            cache: 'no-store',
            headers: { Accept: 'application/json' }
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

    return body;
}

async function postComponentsEndpoint<T = unknown>(
    endpoint: ComponentsApiEndpoint,
    body: unknown,
    target = getRollerDbTarget()
): Promise<T> {
    const url = resolveComponentsUrl(endpoint, target);

    let res: Response;
    try {
        res = await fetch(url, {
            method: 'POST',
            cache: 'no-store',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (e) {
        const direct = directApiBase();
        const hint = direct
            ? `Cannot reach swf-api at ${direct}. Start swf-api (port 3200).`
            : 'Cannot reach API. Start swf-api and swf-app, or set NEXT_PUBLIC_SWF_API_URL in .env.local.';
        const detail = e instanceof Error ? e.message : 'Network error';
        throw new Error(`${hint} (${detail})`);
    }

    let responseBody: unknown = null;
    try {
        responseBody = await res.json();
    } catch {
        responseBody = null;
    }

    if (!res.ok) {
        throw new Error(parseErrorMessage(responseBody, res.status));
    }

    return responseBody as T;
}

export async function replaceComponent(
    machineName: string,
    partKey: MachineFixedPartKey,
    target = getRollerDbTarget(),
    options?: { partId?: string; runtimeLimit?: number }
): Promise<void> {
    await postComponentsEndpoint(
        'replace',
        {
            params: {
                MachineName: machineName,
                PartKey: partKey,
                PartSeq: fixedPartKeyToSeq(partKey),
                ...(options?.partId ? { PartId: options.partId } : {}),
                ...(options?.runtimeLimit != null ? { RuntimeLimit: options.runtimeLimit } : {})
            }
        },
        target
    );
}

export async function updateComponentRuntime(
    runtimeSec: number,
    target = getRollerDbTarget(),
    options: { partId?: string; machineName?: string; partKey?: MachineFixedPartKey }
): Promise<void> {
    if (!options.partId && (!options.machineName || !options.partKey)) {
        throw new Error('PartId or machine name + part key required');
    }

    await postComponentsEndpoint(
        'updateruntime',
        {
            params: {
                RuntimeSec: runtimeSec,
                ...(options.partId ? { PartId: options.partId } : {}),
                ...(options.machineName ? { MachineName: options.machineName } : {}),
                ...(options.partKey
                    ? { PartKey: options.partKey, PartSeq: fixedPartKeyToSeq(options.partKey) }
                    : {})
            }
        },
        target
    );
}

export async function updateComponentRuntimeLimit(
    runtimeLimitHours: number,
    target = getRollerDbTarget(),
    options: { partId?: string; machineName?: string; partKey?: MachineFixedPartKey }
): Promise<void> {
    if (!options.partId && (!options.machineName || !options.partKey)) {
        throw new Error('PartId or machine name + part key required');
    }

    await postComponentsEndpoint(
        'updateruntimelimit',
        {
            params: {
                RuntimeLimit: runtimeLimitHours,
                ...(options.partId ? { PartId: options.partId } : {}),
                ...(options.machineName ? { MachineName: options.machineName } : {}),
                ...(options.partKey
                    ? { PartKey: options.partKey, PartSeq: fixedPartKeyToSeq(options.partKey) }
                    : {})
            }
        },
        target
    );
}

export function componentsApiBaseForDisplay(): string {
    return directApiBase() || DEFAULT_SWF_API;
}
