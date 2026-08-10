import { getRollerDbTarget, type RollerDbTarget } from './rollerMonitoringDbTarget';
import { asRecordArray, rowNum, rowStr } from './parseRows';
import type { ProcessCd, StrandLineCd } from './processCatalog';

export type GearboxAssetRow = {
    gearboxId: string;
    gearboxNm: string;
    processCd: ProcessCd;
    lineCd: StrandLineCd | null;
    status: 'SPARE' | 'IN_USE' | 'REPAIR' | string;
    currentMachineNm: string;
    currentPartId: string;
    lifetimeRuntimeSec: number;
    installRuntimeSec: number;
    runtimeLimitHour: number;
};

export type GearboxHistoryRow = {
    histId: number;
    gearboxId: string;
    gearboxNm: string;
    machineNm: string;
    partId: string;
    mountDt: string;
    dismountDt: string;
    runtimeSec: number;
    reason: string;
};

function directApiBase(): string {
    if (typeof process === 'undefined') return '';
    const v = process.env.NEXT_PUBLIC_SWF_API_URL;
    return v ? String(v).replace(/\/$/, '') : '';
}

function resolveGearboxUrl(target: RollerDbTarget = getRollerDbTarget(), suffix = ''): string {
    const apiPath =
        target === 'production' ? `/components/sfcwr/gearbox${suffix}` : `/components/gearbox${suffix}`;
    const direct = directApiBase();
    if (direct) return `${direct}${apiPath}`;
    return target === 'production'
        ? `/api/components/sfcwr/gearbox${suffix}`
        : `/api/components/gearbox${suffix}`;
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

async function postGearbox(
    suffix: string,
    body: unknown,
    target: RollerDbTarget
): Promise<void> {
    const url = resolveGearboxUrl(target, suffix);
    let res: Response;
    try {
        res = await fetch(url, {
            method: 'POST',
            cache: 'no-store',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (e) {
        const detail = e instanceof Error ? e.message : 'Network error';
        throw new Error(`Cannot reach gearbox API (${detail})`);
    }

    let parsed: unknown = null;
    try {
        parsed = await res.json();
    } catch {
        parsed = null;
    }

    if (!res.ok) throw new Error(parseErrorMessage(parsed, res.status));
}

function mapAsset(row: Record<string, unknown>): GearboxAssetRow {
    const line = rowStr(row, 'LINE_CD');
    const id = rowStr(row, 'GEARBOX_ID').toUpperCase();
    const nm = rowStr(row, 'GEARBOX_NM', 'GearboxNm');
    return {
        gearboxId: id,
        gearboxNm: nm || id,
        processCd: rowStr(row, 'PROCESS_CD').toUpperCase() as ProcessCd,
        lineCd: line ? (line.toUpperCase() as StrandLineCd) : null,
        status: rowStr(row, 'STATUS').toUpperCase(),
        currentMachineNm: rowStr(row, 'CURRENT_MACHINE_NM'),
        currentPartId: rowStr(row, 'CURRENT_PART_ID'),
        lifetimeRuntimeSec: rowNum(row, 'LIFETIME_RUNTIME_SEC'),
        installRuntimeSec: rowNum(row, 'InstallRuntimeSec', 'INSTALL_RUNTIME_SEC'),
        runtimeLimitHour: rowNum(row, 'RuntimeLimitHour', 'RUNTIME_LIMIT_HOUR')
    };
}

export function gearboxLabel(asset: Pick<GearboxAssetRow, 'gearboxId' | 'gearboxNm'>): string {
    if (!asset.gearboxNm || asset.gearboxNm === asset.gearboxId) return asset.gearboxId;
    return `${asset.gearboxNm} (${asset.gearboxId})`;
}

export async function fetchGearboxAssets(
    processCd: ProcessCd,
    lineCd: StrandLineCd | null = null,
    target = getRollerDbTarget(),
    options?: { status?: 'SPARE' | 'IN_USE' | 'REPAIR' }
): Promise<GearboxAssetRow[]> {
    if (processCd === 'STRANDING' && !lineCd) {
        throw new Error('line_cd is required for STRANDING');
    }

    const params = new URLSearchParams();
    params.set('process_cd', processCd);
    if (lineCd) params.set('line_cd', lineCd);
    if (options?.status) params.set('status', options.status);

    const url = `${resolveGearboxUrl(target)}?${params.toString()}`;
    let res: Response;
    try {
        res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    } catch (e) {
        const detail = e instanceof Error ? e.message : 'Network error';
        throw new Error(`Cannot reach gearbox API (${detail})`);
    }

    let body: unknown = null;
    try {
        body = await res.json();
    } catch {
        body = null;
    }

    if (!res.ok) throw new Error(parseErrorMessage(body, res.status));

    return asRecordArray(body)
        .map(mapAsset)
        .filter((a) => a.gearboxId)
        .sort((a, b) => a.gearboxId.localeCompare(b.gearboxId));
}

export async function fetchGearboxHistory(
    processCd: ProcessCd,
    lineCd: StrandLineCd | null,
    gearboxId: string | null = null,
    target = getRollerDbTarget()
): Promise<GearboxHistoryRow[]> {
    if (processCd === 'STRANDING' && !lineCd) {
        throw new Error('line_cd is required for STRANDING');
    }

    const params = new URLSearchParams();
    params.set('process_cd', processCd);
    if (lineCd) params.set('line_cd', lineCd);
    if (gearboxId) params.set('gearbox_id', gearboxId);

    const url = `${resolveGearboxUrl(target, '/history')}?${params.toString()}`;
    let res: Response;
    try {
        res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    } catch (e) {
        const detail = e instanceof Error ? e.message : 'Network error';
        throw new Error(`Cannot reach gearbox history API (${detail})`);
    }

    let body: unknown = null;
    try {
        body = await res.json();
    } catch {
        body = null;
    }

    if (!res.ok) throw new Error(parseErrorMessage(body, res.status));

    return asRecordArray(body).map((row) => ({
        histId: rowNum(row, 'HIST_ID'),
        gearboxId: rowStr(row, 'GEARBOX_ID').toUpperCase(),
        gearboxNm: rowStr(row, 'GEARBOX_NM') || rowStr(row, 'GEARBOX_ID'),
        machineNm: rowStr(row, 'MACHINE_NM'),
        partId: rowStr(row, 'PART_ID'),
        mountDt: rowStr(row, 'MOUNT_DT'),
        dismountDt: rowStr(row, 'DISMOUNT_DT'),
        runtimeSec: rowNum(row, 'RUNTIME_SEC'),
        reason: rowStr(row, 'REASON')
    }));
}

export async function swapGearbox(
    input: {
        machineName: string;
        newGearboxId: string;
        processCd: ProcessCd;
        lineCd?: StrandLineCd | null;
        runtimeLimit?: number;
        removedStatus?: 'REPAIR' | 'SPARE';
    },
    target = getRollerDbTarget()
): Promise<void> {
    await postGearbox(
        '/swap',
        {
            params: {
                MachineName: input.machineName,
                NewGearboxId: input.newGearboxId,
                ProcessCd: input.processCd,
                LineCd: input.lineCd ?? null,
                RuntimeLimit: input.runtimeLimit ?? null,
                RemovedStatus: input.removedStatus ?? 'REPAIR'
            }
        },
        target
    );
}

export async function setGearboxStatus(
    input: { gearboxId: string; status: 'SPARE' | 'REPAIR'; company?: string; factory?: string },
    target = getRollerDbTarget()
): Promise<void> {
    await postGearbox(
        '/status',
        {
            params: {
                GearboxId: input.gearboxId,
                Status: input.status,
                Company: input.company ?? 'KSB',
                Factory: input.factory ?? 'F002'
            }
        },
        target
    );
}

export async function updateGearboxName(
    input: { gearboxId: string; gearboxNm: string; company?: string; factory?: string },
    target = getRollerDbTarget()
): Promise<void> {
    await postGearbox(
        '/update',
        {
            params: {
                GearboxId: input.gearboxId,
                GearboxNm: input.gearboxNm.trim(),
                Company: input.company ?? 'KSB',
                Factory: input.factory ?? 'F002'
            }
        },
        target
    );
}
