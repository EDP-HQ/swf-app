import { ROLLER_DEFAULT_LIMIT_HOURS } from './constants';
import { createGearbox, createSkipperBack, createSkipperFront, recountMachine } from './machineParts';
import { asRecordArray, rowNum, rowStr } from './parseRows';
import { computeRollerStatus, usagePct } from './rollerStatus';
import type { MachineDashboard, RollerDashboardData, RollerRow } from './types';

type MergeInput = {
    list: unknown;
    onoff: unknown;
    activeList: unknown;
    currentRuntime: unknown;
    history: unknown;
};

function runtimeHoursFromSeconds(sec: number): number {
    return sec / 3600;
}

function buildRuntimeMap(rows: Record<string, unknown>[]) {
    const map = new Map<string, { runtimeHours: number; rollerId: string; replaceDt: string }>();
    for (const row of rows) {
        const bin = rowStr(row, 'BIN_LOCATION_CD');
        if (!bin) continue;
        const sec = rowNum(row, 'RUNTIME_SEC');
        map.set(bin, {
            runtimeHours: runtimeHoursFromSeconds(sec),
            rollerId: rowStr(row, 'ROLLER_ID'),
            replaceDt: rowStr(row, 'REPLACE_DT')
        });
    }
    return map;
}

function buildHistoryMap(rows: Record<string, unknown>[]) {
    const map = new Map<string, { limitHours: number; rollerId: string; replaceDt: string }>();
    for (const row of rows) {
        const bin = rowStr(row, 'BIN_LOCATION_CD');
        if (!bin) continue;
        const limit = rowNum(row, 'RUNTIME_LIMIT_HOUR') || ROLLER_DEFAULT_LIMIT_HOURS;
        map.set(bin, {
            limitHours: limit,
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

function buildOnoffMap(rows: Record<string, unknown>[]) {
    const map = new Map<string, { running: boolean; machineNo: string }>();
    for (const row of rows) {
        const name = rowStr(row, 'MachineName', 'MACHINE_NAME', 'MACHINE_CD');
        if (!name) continue;
        const runType = rowStr(row, 'RUN_DN_TYPE');
        map.set(name, {
            running: runType === '01',
            machineNo: rowStr(row, 'MACHINE_NO', 'MACHINE_CD')
        });
    }
    return map;
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
    const historyMap = buildHistoryMap(asRecordArray(input.history));
    const grouped = groupListByMachine(listRows);

    const machines: MachineDashboard[] = [];

    for (const [machineName, rollers] of grouped) {
        const onoff = onoffMap.get(machineName);
        const rollerRows: RollerRow[] = rollers.map((row, index) => {
            const bin = rowStr(row, 'BIN_LOCATION_CD');
            const runtime = runtimeMap.get(bin);
            const hist = historyMap.get(bin);
            const runtimeHours = runtime?.runtimeHours ?? 0;
            const limitHours = hist?.limitHours ?? ROLLER_DEFAULT_LIMIT_HOURS;
            const status = computeRollerStatus(runtimeHours, limitHours);

            return {
                displayName: `R${index + 1}`,
                binLocation: bin,
                description: rowStr(row, 'BIN_LOCATION_DESC'),
                machineCode: rowStr(row, 'MACHINE_CD'),
                rollerId: runtime?.rollerId || hist?.rollerId || '',
                runtimeHours,
                limitHours,
                replaceDt: runtime?.replaceDt || hist?.replaceDt || '',
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
