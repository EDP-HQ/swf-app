import { liveFixedPartRuntimeHours, MACHINE_FIXED_PART_KEYS } from './machineParts';
import { liveRollerRuntimeHours } from './machineRollers';
import { computeRollerStatus, needsAttentionStatus, usagePct } from './rollerStatus';
import type { MachineDashboard } from './types';

export type AttentionItem = {
    key: string;
    machineName: string;
    label: string;
    runtimeHours: number;
    limitHours: number;
    pct: number;
};

/** Due + overdue parts/rollers — same rules as the parts-board Need attention list. */
export function collectAttentionItems(
    machines: MachineDashboard[],
    syncEpochMs: number,
    nowMs: number,
    includeRollers: boolean
): AttentionItem[] {
    const items: AttentionItem[] = [];
    for (const machine of machines) {
        for (const partKey of MACHINE_FIXED_PART_KEYS) {
            const part = machine[partKey];
            if (!part.partId) continue;
            const runtimeHours = liveFixedPartRuntimeHours(part, machine, syncEpochMs, nowMs);
            if (!needsAttentionStatus(computeRollerStatus(runtimeHours, part.limitHours))) continue;
            items.push({
                key: `${machine.name}:fixed:${partKey}:${part.partId}`,
                machineName: machine.name,
                label: part.displayName,
                runtimeHours,
                limitHours: part.limitHours,
                pct: usagePct(runtimeHours, part.limitHours)
            });
        }
        for (const part of machine.extraParts ?? []) {
            if (!part.partId) continue;
            const runtimeHours = liveFixedPartRuntimeHours(part, machine, syncEpochMs, nowMs);
            if (!needsAttentionStatus(computeRollerStatus(runtimeHours, part.limitHours))) continue;
            items.push({
                key: `${machine.name}:custom:${part.partId}`,
                machineName: machine.name,
                label: part.displayName,
                runtimeHours,
                limitHours: part.limitHours,
                pct: usagePct(runtimeHours, part.limitHours)
            });
        }
        if (!includeRollers) continue;
        for (const roller of machine.rollers) {
            const runtimeHours = liveRollerRuntimeHours(roller, machine, syncEpochMs, nowMs);
            if (!needsAttentionStatus(computeRollerStatus(runtimeHours, roller.limitHours))) continue;
            items.push({
                key: `${machine.name}:roller:${roller.binLocation || roller.rollerId || roller.displayName}`,
                machineName: machine.name,
                label: roller.displayName,
                runtimeHours,
                limitHours: roller.limitHours,
                pct: usagePct(runtimeHours, roller.limitHours)
            });
        }
    }
    return items.sort(
        (a, b) => b.runtimeHours / Math.max(b.limitHours, 0.001) - a.runtimeHours / Math.max(a.limitHours, 0.001)
    );
}
