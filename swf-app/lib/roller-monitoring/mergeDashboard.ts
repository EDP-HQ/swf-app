import { createGearbox, createSkipperBack, createSkipperFront, recountMachine } from './machineParts';
import { asRecordArray, rowNum, rowStr } from './parseRows';
import { computeRollerStatus, usagePct } from './rollerStatus';
import type { MachineDashboard, RollerDashboardData, RollerRow } from './types';

type MergeInput = {
    list: unknown;
    onoff: unknown;
    activeList: unknown;
    currentRuntime: unknown;
};

function runtimeHoursFromSeconds(sec: number): number {
    return sec / 3600;
}

/** Active roller row from sp_Roller_Curr_Runtime — source of truth for ID/runtime/limit/install. */
function buildRuntimeMap(rows: Record<string, unknown>[]) {
    const map = new Map<
        string,
        { runtimeHours: number; limitHours: number; rollerId: string; replaceDt: string }
    >();
    for (const row of rows) {
        const bin = rowStr(row, 'BIN_LOCATION_CD');
        if (!bin) continue;
        const sec = rowNum(row, 'RUNTIME_SEC');
        map.set(bin, {
            runtimeHours: runtimeHoursFromSeconds(sec),
            limitHours: rowNum(row, 'RUNTIME_LIMIT_HOUR'),
            rollerId: rowStr(row, 'ROLLER_ID'),
            replaceDt: rowStr(row, 'REPLACE_DT')
        });
    }
    return map;
}

function buildActiveSet(rows: Record<string, unknown>[]) {
    const set = new Set<string>();
    for (const row of rows) {
        if (typeof row === 'string') {
            set.add(row);
            continue;
        }
        const bin = rowStr(row as Record<string, unknown>, 'BIN_LOCATION_CD');
        if (bin) set.add(bin);
    }
    return set;
}

function normalizeOnoffName(name: string): string {
    return name
        .trim()
        .toUpperCase()
        .replace(/^SWF\s+/i, '')
        .replace(/\s*\([^)]*\)\s*$/, '')
        .replace(/\s+/g, ' ');
}

function buildOnoffMap(rows: Record<string, unknown>[]) {
    const map = new Map<string, { running: boolean; machineNo: string }>();
    const setHit = (key: string, hit: { running: boolean; machineNo: string }) => {
        if (!key) return;
        map.set(key, hit);
        map.set(normalizeOnoffName(key), hit);
    };
    for (const row of rows) {
        const hit = {
            running: rowStr(row, 'RUN_DN_TYPE') === '01',
            machineNo: rowStr(row, 'MACHINE_NO', 'MACHINE_CD')
        };
        setHit(rowStr(row, 'MachineName', 'MACHINE_NAME', 'MACHINE_NM'), hit);
        setHit(rowStr(row, 'MACHINE_DESC'), hit);
        setHit(rowStr(row, 'MACHINE_DESC_SHORT'), hit);
        if (hit.machineNo) {
            setHit(hit.machineNo, hit);
            setHit(hit.machineNo.toUpperCase(), hit);
        }
    }
    return map;
}

type ApplyOnoffOptions = {
    /** INLINE: match takeup by stored MACHINE_CD only — never fill code from name. */
    matchByCodeOnly?: boolean;
};

/** Overlay plant Run/Stop onto registry machines (Drawing, Closing, INLINE, …). */
export function applyOnoffToMachines(
    machines: MachineDashboard[],
    onoff: unknown,
    options?: ApplyOnoffOptions
): MachineDashboard[] {
    const onoffMap = buildOnoffMap(asRecordArray(onoff));
    if (!onoffMap.size) return machines;
    return machines.map((m) => {
        if (options?.matchByCodeOnly) {
            if (!m.machineNo) return m;
            const hit = onoffMap.get(m.machineNo) ?? onoffMap.get(m.machineNo.toUpperCase());
            if (!hit) return m;
            return recountMachine({ ...m, running: hit.running });
        }
        const hit =
            onoffMap.get(m.name) ??
            onoffMap.get(normalizeOnoffName(m.name)) ??
            (m.machineNo ? onoffMap.get(m.machineNo) ?? onoffMap.get(m.machineNo.toUpperCase()) : undefined);
        if (!hit) return m;
        return recountMachine({
            ...m,
            machineNo: hit.machineNo || m.machineNo,
            running: hit.running
        });
    });
}

function groupListByMachine(rows: Record<string, unknown>[]) {
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
        const machine = rowStr(row, 'MACHINE_NAME', 'FACTORY', 'MACHINE_CD') || 'Unknown';
        if (!groups.has(machine)) groups.set(machine, []);
        groups.get(machine)!.push(row);
    }
    return groups;
}

export function mergeRollerDashboard(input: MergeInput): RollerDashboardData {
    const listRows = asRecordArray(input.list);
    const onoffMap = buildOnoffMap(asRecordArray(input.onoff));
    const activeSet = buildActiveSet(asRecordArray(input.activeList));
    const runtimeMap = buildRuntimeMap(asRecordArray(input.currentRuntime));
    const grouped = groupListByMachine(listRows);

    const machines: MachineDashboard[] = [];

    for (const [machineName, rollers] of grouped) {
        const onoff = onoffMap.get(machineName) ?? onoffMap.get(normalizeOnoffName(machineName));
        const rollerRows: RollerRow[] = rollers.map((row, index) => {
            const bin = rowStr(row, 'BIN_LOCATION_CD');
            const runtime = runtimeMap.get(bin);
            const runtimeHours = runtime?.runtimeHours ?? 0;
            const limitHours = runtime?.limitHours ?? 0;
            const status = computeRollerStatus(runtimeHours, limitHours);

            return {
                displayName: `R${index + 1}`,
                binLocation: bin,
                description: rowStr(row, 'BIN_LOCATION_DESC'),
                machineCode: rowStr(row, 'MACHINE_CD'),
                rollerId: runtime?.rollerId || '',
                runtimeHours,
                limitHours,
                replaceDt: runtime?.replaceDt || '',
                isActive: activeSet.has(bin),
                status,
                usagePct: usagePct(runtimeHours, limitHours)
            };
        });

        machines.push(
            recountMachine({
                name: machineName,
                machineNo: onoff?.machineNo || '',
                running: onoff?.running ?? false,
                rollers: rollerRows,
                gearbox: createGearbox(),
                skipperFront: createSkipperFront(),
                skipperBack: createSkipperBack(),
                extraParts: [],
                okCount: 0,
                dueCount: 0,
                overdueCount: 0,
                activeCount: 0
            })
        );
    }

    machines.sort((a, b) => a.name.localeCompare(b.name));

    return {
        machines,
        lastSync: new Date().toISOString()
    };
}
