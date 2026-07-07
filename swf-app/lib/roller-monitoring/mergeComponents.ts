import {
    createGearbox,
    createSkipperBack,
    createSkipperFront,
    formatCustomDisplayName,
    recountMachine,
    withFixedPartStats
} from './machineParts';
import { CUSTOM_COMPONENT_DEFAULT_LIMIT_HOURS } from './constants';
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

function customPartFromRow(row: Record<string, unknown>): FixedPartRow {
    const partType = rowStr(row, 'PART_TYPE');
    const runtimeHours = runtimeHoursFromSeconds(rowNum(row, 'RUNTIME_SEC'));
    const limitHours = rowNum(row, 'RUNTIME_LIMIT_HOUR') || CUSTOM_COMPONENT_DEFAULT_LIMIT_HOURS;
    return withFixedPartStats(
        {
            partKind: 'custom',
            partType,
            partSeq: rowNum(row, 'PART_SEQ') || undefined,
            displayName: formatCustomDisplayName(partType),
            partId: rowStr(row, 'PART_ID'),
            replaceDt: rowStr(row, 'REPLACE_DT'),
            runtimeHours: 0,
            limitHours: CUSTOM_COMPONENT_DEFAULT_LIMIT_HOURS,
            status: 'OK',
            usagePct: 0
        },
        runtimeHours,
        limitHours
    );
}

/** Overlay DB component rows onto machines (gearbox + skipper SF/SB + custom parts). */
export function applyComponentsToMachines(
    machines: MachineDashboard[],
    components: unknown
): MachineDashboard[] {
    const rows = asRecordArray(components);
    if (!rows.length) return machines;

    const byMachine = new Map<string, Partial<Record<MachineFixedPartKey, FixedPartRow>>>();
    const extrasByMachine = new Map<string, FixedPartRow[]>();

    for (const row of rows) {
        const machineNm = rowStr(row, 'MACHINE_NM', 'MACHINE_NAME');
        if (!machineNm) continue;

        const key = partKeyFromRow(row);
        if (key) {
            if (!byMachine.has(machineNm)) byMachine.set(machineNm, {});
            byMachine.get(machineNm)![key] = fixedPartFromRow(row, key);
            continue;
        }

        const part = customPartFromRow(row);
        if (!extrasByMachine.has(machineNm)) extrasByMachine.set(machineNm, []);
        extrasByMachine.get(machineNm)!.push(part);
    }

    extrasByMachine.forEach((parts) => {
        parts.sort((a, b) => (a.partSeq ?? 0) - (b.partSeq ?? 0));
    });

    return machines.map((machine) => {
        const parts = byMachine.get(machine.name);
        const extras = extrasByMachine.get(machine.name);
        if (!parts && !extras?.length) return machine;

        return recountMachine({
            ...machine,
            gearbox: parts?.gearbox ?? machine.gearbox,
            skipperFront: parts?.skipperFront ?? machine.skipperFront,
            skipperBack: parts?.skipperBack ?? machine.skipperBack,
            extraParts: extras ?? machine.extraParts
        });
    });
}
