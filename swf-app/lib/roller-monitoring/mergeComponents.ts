import {
    createGearbox,
    createSkipperBack,
    createSkipperFront,
    recountMachine,
    withFixedPartStats
} from './machineParts';
import { asRecordArray, rowNum, rowStr } from './parseRows';
import type { FixedPartRow, MachineDashboard, MachineFixedPartKey } from './types';

function runtimeHoursFromSeconds(sec: number): number {
    return sec / 3600;
}

function partKeyFromRow(row: Record<string, unknown>): MachineFixedPartKey | null {
    const partType = rowStr(row, 'PART_TYPE').toUpperCase();
    if (partType === 'GEARBOX') return 'gearbox';
    if (partType === 'SF') return 'skipperFront';
    if (partType === 'SB') return 'skipperBack';

    const seq = rowNum(row, 'PART_SEQ');
    if (seq === 1) return 'gearbox';
    if (seq === 2) return 'skipperFront';
    if (seq === 3) return 'skipperBack';
    return null;
}

function templateForKey(key: MachineFixedPartKey): FixedPartRow {
    if (key === 'gearbox') return createGearbox();
    if (key === 'skipperFront') return createSkipperFront();
    return createSkipperBack();
}

function fixedPartFromRow(row: Record<string, unknown>, key: MachineFixedPartKey): FixedPartRow {
    const template = templateForKey(key);
    const runtimeHours = runtimeHoursFromSeconds(rowNum(row, 'RUNTIME_SEC'));
    const limitHours = rowNum(row, 'RUNTIME_LIMIT_HOUR') || template.limitHours;
    return withFixedPartStats(
        {
            ...template,
            partId: rowStr(row, 'PART_ID'),
            partType: rowStr(row, 'PART_TYPE'),
            partSeq: rowNum(row, 'PART_SEQ') || template.partSeq,
            replaceDt: rowStr(row, 'REPLACE_DT')
        },
        runtimeHours,
        limitHours
    );
}

/** Overlay DB component rows onto machines (gearbox + skipper SF/SB). */
export function applyComponentsToMachines(
    machines: MachineDashboard[],
    components: unknown
): MachineDashboard[] {
    const rows = asRecordArray(components);
    if (!rows.length) return machines;

    const byMachine = new Map<string, Partial<Record<MachineFixedPartKey, FixedPartRow>>>();
    for (const row of rows) {
        const machineNm = rowStr(row, 'MACHINE_NM', 'MACHINE_NAME');
        const key = partKeyFromRow(row);
        if (!machineNm || !key) continue;

        if (!byMachine.has(machineNm)) byMachine.set(machineNm, {});
        byMachine.get(machineNm)![key] = fixedPartFromRow(row, key);
    }

    return machines.map((machine) => {
        const parts = byMachine.get(machine.name);
        if (!parts) return machine;

        return recountMachine({
            ...machine,
            gearbox: parts.gearbox ?? machine.gearbox,
            skipperFront: parts.skipperFront ?? machine.skipperFront,
            skipperBack: parts.skipperBack ?? machine.skipperBack
        });
    });
}
