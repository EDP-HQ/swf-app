import { getRollerDbTarget, type RollerDbTarget } from './rollerMonitoringDbTarget';
import { asRecordArray, rowStr } from './parseRows';
import type { ProcessCd, StrandLineCd } from './processCatalog';

export type CmMachineRow = {
    company: string;
    factory: string;
    processCd: ProcessCd;
    lineCd: StrandLineCd | null;
    machineName: string;
    visible: boolean;
};

function directApiBase(): string {
    if (typeof process === 'undefined') return '';
    const v = process.env.NEXT_PUBLIC_SWF_API_URL;
    return v ? String(v).replace(/\/$/, '') : '';
}

function resolveMachinesUrl(target: RollerDbTarget = getRollerDbTarget(), suffix = ''): string {
    const apiPath =
        target === 'production'
            ? `/components/sfcwr/machines${suffix}`
            : `/components/machines${suffix}`;
    const direct = directApiBase();
    if (direct) return `${direct}${apiPath}`;
    return target === 'production'
        ? `/api/components/sfcwr/machines${suffix}`
        : `/api/components/machines${suffix}`;
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

function mapMachine(row: Record<string, unknown>): CmMachineRow {
    const line = rowStr(row, 'LINE_CD');
    const useYn = rowStr(row, 'USE_YN').toUpperCase();
    return {
        company: rowStr(row, 'COMPANY'),
        factory: rowStr(row, 'FACTORY'),
        processCd: rowStr(row, 'PROCESS_CD').toUpperCase() as ProcessCd,
        lineCd: line ? (line.toUpperCase() as StrandLineCd) : null,
        machineName: rowStr(row, 'MACHINE_NM', 'MACHINE_NAME'),
        visible: useYn !== 'N'
    };
}

export async function fetchCmMachines(
    processCd: ProcessCd,
    lineCd: StrandLineCd | null = null,
    target = getRollerDbTarget(),
    options?: { includeHidden?: boolean }
): Promise<CmMachineRow[]> {
    if (processCd === 'STRANDING' && !lineCd) {
        throw new Error('line_cd is required for STRANDING');
    }

    const params = new URLSearchParams();
    params.set('process_cd', processCd);
    if (lineCd) params.set('line_cd', lineCd);
    if (options?.includeHidden) params.set('include_hidden', '1');

    const url = `${resolveMachinesUrl(target)}?${params.toString()}`;
    let res: Response;
    try {
        res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    } catch (e) {
        const detail = e instanceof Error ? e.message : 'Network error';
        throw new Error(`Cannot reach machines API (${detail})`);
    }

    let body: unknown = null;
    try {
        body = await res.json();
    } catch {
        body = null;
    }

    if (!res.ok) throw new Error(parseErrorMessage(body, res.status));

    // Defense: never accept another process/line's registry rows
    return asRecordArray(body)
        .map(mapMachine)
        .filter((m) => m.machineName)
        .filter((m) => {
            if (m.processCd && m.processCd !== processCd) return false;
            if (processCd === 'STRANDING') {
                if (!lineCd || m.lineCd !== lineCd) return false;
            } else if (m.lineCd) {
                return false;
            }
            return true;
        })
        .sort((a, b) => a.machineName.localeCompare(b.machineName));
}

export async function insertCmMachine(
    input: {
        processCd: ProcessCd;
        lineCd?: StrandLineCd | null;
        machineName: string;
        company?: string;
        factory?: string;
    },
    target = getRollerDbTarget()
): Promise<void> {
    const url = resolveMachinesUrl(target);
    let res: Response;
    try {
        res = await fetch(url, {
            method: 'POST',
            cache: 'no-store',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                params: {
                    Company: input.company ?? 'KSB',
                    Factory: input.factory ?? 'F002',
                    ProcessCd: input.processCd,
                    LineCd: input.lineCd ?? null,
                    MachineNm: input.machineName.trim()
                }
            })
        });
    } catch (e) {
        const detail = e instanceof Error ? e.message : 'Network error';
        throw new Error(`Cannot reach machines API (${detail})`);
    }

    let body: unknown = null;
    try {
        body = await res.json();
    } catch {
        body = null;
    }

    if (!res.ok) throw new Error(parseErrorMessage(body, res.status));
}

export async function setCmMachineVisible(
    input: {
        processCd: ProcessCd;
        lineCd?: StrandLineCd | null;
        machineName: string;
        visible: boolean;
        company?: string;
        factory?: string;
    },
    target = getRollerDbTarget()
): Promise<void> {
    const url = resolveMachinesUrl(target, '/visible');
    let res: Response;
    try {
        res = await fetch(url, {
            method: 'POST',
            cache: 'no-store',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                params: {
                    Company: input.company ?? 'KSB',
                    Factory: input.factory ?? 'F002',
                    ProcessCd: input.processCd,
                    LineCd: input.lineCd ?? null,
                    MachineNm: input.machineName.trim(),
                    VisibleYn: input.visible ? 'Y' : 'N'
                }
            })
        });
    } catch (e) {
        const detail = e instanceof Error ? e.message : 'Network error';
        throw new Error(`Cannot reach machines API (${detail})`);
    }

    let body: unknown = null;
    try {
        body = await res.json();
    } catch {
        body = null;
    }

    if (!res.ok) throw new Error(parseErrorMessage(body, res.status));
}
