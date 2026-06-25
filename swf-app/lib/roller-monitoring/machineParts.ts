import {
    GEARBOX_DEFAULT_LIMIT_HOURS,
    SKIPPER_BEARING_DEFAULT_LIMIT_HOURS
} from './constants';
import { computeRollerStatus, usagePct } from './rollerStatus';
import type { FixedPartKind, FixedPartRow, MachineDashboard, MachineFixedPartKey, PartHealthStatus, RollerRow } from './types';

export const MACHINE_FIXED_PART_KEYS: MachineFixedPartKey[] = ['gearbox', 'skipperFront', 'skipperBack'];

export function createGearbox(): FixedPartRow {
    return {
        partKind: 'gearbox',
        partType: 'GEARBOX',
        partSeq: 1,
        displayName: 'Gearbox',
        runtimeHours: 0,
        limitHours: GEARBOX_DEFAULT_LIMIT_HOURS,
        replaceDt: '',
        status: 'OK',
        usagePct: 0
    };
}

export function createSkipperFront(): FixedPartRow {
    return {
        partKind: 'skipper_bearing_sf',
        partType: 'SF',
        partSeq: 2,
        displayName: 'Skipper SF',
        runtimeHours: 0,
        limitHours: SKIPPER_BEARING_DEFAULT_LIMIT_HOURS,
        replaceDt: '',
        status: 'OK',
        usagePct: 0
    };
}

export function createSkipperBack(): FixedPartRow {
    return {
        partKind: 'skipper_bearing_sb',
        partType: 'SB',
        partSeq: 3,
        displayName: 'Skipper SB',
        runtimeHours: 0,
        limitHours: SKIPPER_BEARING_DEFAULT_LIMIT_HOURS,
        replaceDt: '',
        status: 'OK',
        usagePct: 0
    };
}

/** @deprecated use createSkipperFront / createSkipperBack */
export function createSkipperBearing(): FixedPartRow {
    return createSkipperFront();
}

function preserveFixedPart(
    incoming: FixedPartRow,
    old: FixedPartRow | undefined,
    elapsedHours: number,
    machineStillRunning: boolean
): FixedPartRow {
    if (!old) return incoming;

    // New part after replace — use DB runtime (reset to 0), not accumulated client state.
    if (incoming.partId !== old.partId) {
        return withFixedPartStats(incoming, incoming.runtimeHours, incoming.limitHours);
    }

    // Machine still RUN: tick forward between dashboard polls.
    if (machineStillRunning && elapsedHours > 0) {
        const limitHours = incoming.limitHours || old.limitHours;
        return withFixedPartStats(
            { ...incoming, limitHours },
            old.runtimeHours + elapsedHours,
            limitHours
        );
    }

    // Machine STOP (or STOP→RUN): trust DB / saved runtime from incoming.
    return withFixedPartStats(
        incoming,
        incoming.runtimeHours,
        incoming.limitHours || old.limitHours
    );
}

/** Read skipper from previous machine state (supports legacy single skipperBearing). */
function oldSkipperPart(
    old: MachineDashboard & { skipperBearing?: FixedPartRow },
    side: 'skipperFront' | 'skipperBack'
): FixedPartRow | undefined {
    if (side === 'skipperFront') return old.skipperFront ?? old.skipperBearing;
    return old.skipperBack ?? old.skipperBearing;
}

export function fixedPartKeyToSeq(key: MachineFixedPartKey): number {
    if (key === 'gearbox') return 1;
    if (key === 'skipperFront') return 2;
    return 3;
}

export function withFixedPartStats(part: FixedPartRow, runtimeHours: number, limitHours: number): FixedPartRow {
    const status = computeRollerStatus(runtimeHours, limitHours);
    return {
        ...part,
        runtimeHours,
        limitHours,
        status,
        usagePct: usagePct(runtimeHours, limitHours)
    };
}

/** Fixed parts accumulate runtime while the machine is RUN. */
export function liveFixedPartRuntimeHours(
    part: FixedPartRow,
    machine: MachineDashboard,
    syncEpochMs: number,
    nowMs: number
): number {
    if (!machine.running) return part.runtimeHours;
    return part.runtimeHours + Math.max(0, (nowMs - syncEpochMs) / 3_600_000);
}

export function liveFixedPartStatus(
    part: FixedPartRow,
    machine: MachineDashboard,
    syncEpochMs: number,
    nowMs: number
): PartHealthStatus {
    const rt = liveFixedPartRuntimeHours(part, machine, syncEpochMs, nowMs);
    return computeRollerStatus(rt, part.limitHours);
}

export function runtimeHoursToSeconds(hours: number): number {
    return Math.max(0, Math.round(hours * 3600));
}

export function machineFixedPartsLiveSnapshot(
    machine: MachineDashboard,
    syncEpochMs: number,
    nowMs: number
): { key: MachineFixedPartKey; part: FixedPartRow; runtimeHours: number; runtimeSec: number }[] {
    return MACHINE_FIXED_PART_KEYS.map((key) => {
        const part = machine[key];
        const runtimeHours = liveFixedPartRuntimeHours(part, machine, syncEpochMs, nowMs);
        return { key, part, runtimeHours, runtimeSec: runtimeHoursToSeconds(runtimeHours) };
    });
}

export function applySavedComponentRuntime(
    machine: MachineDashboard,
    savedSecByKey: Partial<Record<MachineFixedPartKey, number>>
): MachineDashboard {
    let next = { ...machine };
    for (const key of MACHINE_FIXED_PART_KEYS) {
        const sec = savedSecByKey[key];
        if (sec == null) continue;
        next[key] = withFixedPartStats(next[key], sec / 3600, next[key].limitHours);
    }
    return recountMachine(next);
}

export function getMachineFixedParts(machine: MachineDashboard): FixedPartRow[] {
    return [machine.gearbox, machine.skipperFront, machine.skipperBack];
}

export function recountMachine(machine: MachineDashboard): MachineDashboard {
    const allStatuses = [
        ...machine.rollers.map((r) => r.status),
        machine.gearbox.status,
        machine.skipperFront.status,
        machine.skipperBack.status
    ];
    return {
        ...machine,
        okCount: allStatuses.filter((s) => s === 'OK').length,
        dueCount: allStatuses.filter((s) => s === 'Due').length,
        overdueCount: allStatuses.filter((s) => s === 'Overdue').length,
        activeCount: machine.rollers.filter((r) => r.isActive).length
    };
}

export function mergePreservedFixedParts(
    incoming: MachineDashboard[],
    prev: MachineDashboard[],
    elapsedHours: number
): MachineDashboard[] {
    return incoming.map((m) => {
        const old = prev.find((p) => p.name === m.name);
        if (!old) return recountMachine(m);

        const stillRunning = m.running;
        const elapsed = old.running && stillRunning ? elapsedHours : 0;
        const legacyOld = old as MachineDashboard & { skipperBearing?: FixedPartRow };
        const gearbox = preserveFixedPart(m.gearbox, old.gearbox, elapsed, stillRunning);
        const skipperFront = preserveFixedPart(
            m.skipperFront,
            oldSkipperPart(legacyOld, 'skipperFront'),
            elapsed,
            stillRunning
        );
        const skipperBack = preserveFixedPart(
            m.skipperBack,
            oldSkipperPart(legacyOld, 'skipperBack'),
            elapsed,
            stillRunning
        );

        return recountMachine({ ...m, gearbox, skipperFront, skipperBack });
    });
}

export type PlannerPartRow = {
    machine: string;
    partLabel: string;
    partKind: FixedPartKind | 'roller';
    status: PartHealthStatus;
    limitHours: number;
    runtimeHours: number;
};

export function collectPlannerParts(machines: MachineDashboard[]): PlannerPartRow[] {
    const rows: PlannerPartRow[] = [];
    for (const m of machines) {
        for (const part of getMachineFixedParts(m)) {
            if (part.status === 'Due' || part.status === 'Overdue') {
                rows.push({
                    machine: m.name,
                    partLabel: part.displayName,
                    partKind: part.partKind,
                    status: part.status,
                    limitHours: part.limitHours,
                    runtimeHours: part.runtimeHours
                });
            }
        }
        for (const r of m.rollers) {
            if (r.status === 'Due' || r.status === 'Overdue') {
                rows.push({
                    machine: m.name,
                    partLabel: r.displayName,
                    partKind: 'roller',
                    status: r.status,
                    limitHours: r.limitHours,
                    runtimeHours: r.runtimeHours
                });
            }
        }
    }
    return rows;
}

export function isRollerRow(_part: RollerRow | FixedPartRow): _part is RollerRow {
    return !('partKind' in _part);
}
