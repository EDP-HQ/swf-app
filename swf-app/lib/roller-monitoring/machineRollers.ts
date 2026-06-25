import { mergePreservedFixedParts, recountMachine, runtimeHoursToSeconds } from './machineParts';
import { computeRollerStatus, usagePct } from './rollerStatus';
import type { MachineDashboard, RollerRow } from './types';

export function isRollerTicking(machine: MachineDashboard, roller: RollerRow): boolean {
    return machine.running && roller.isActive;
}

export function withRollerStats(roller: RollerRow, runtimeHours: number, limitHours: number): RollerRow {
    const status = computeRollerStatus(runtimeHours, limitHours);
    return {
        ...roller,
        runtimeHours,
        limitHours,
        status,
        usagePct: usagePct(runtimeHours, limitHours)
    };
}

/** Rollers accumulate runtime while machine is RUN and roller is active. */
export function liveRollerRuntimeHours(
    roller: RollerRow,
    machine: MachineDashboard,
    syncEpochMs: number,
    nowMs: number
): number {
    if (!isRollerTicking(machine, roller)) return roller.runtimeHours;
    return roller.runtimeHours + Math.max(0, (nowMs - syncEpochMs) / 3_600_000);
}

export type RollerRuntimeSnapshot = {
    roller: RollerRow;
    runtimeHours: number;
    runtimeSec: number;
};

export function rollerLiveSnapshot(
    roller: RollerRow,
    machine: MachineDashboard,
    syncEpochMs: number,
    nowMs: number
): RollerRuntimeSnapshot {
    const runtimeHours = liveRollerRuntimeHours(roller, machine, syncEpochMs, nowMs);
    return { roller, runtimeHours, runtimeSec: runtimeHoursToSeconds(runtimeHours) };
}

/** Rollers that were ticking on the previous poll but are not anymore. */
export function rollersStoppedTicking(
    oldMachine: MachineDashboard,
    newMachine: MachineDashboard,
    syncEpochMs: number,
    nowMs: number
): RollerRuntimeSnapshot[] {
    const stopped: RollerRuntimeSnapshot[] = [];
    for (const oldRoller of oldMachine.rollers) {
        const newRoller = newMachine.rollers.find((r) => r.binLocation === oldRoller.binLocation);
        if (!newRoller) continue;
        if (isRollerTicking(oldMachine, oldRoller) && !isRollerTicking(newMachine, newRoller)) {
            stopped.push(rollerLiveSnapshot(oldRoller, oldMachine, syncEpochMs, nowMs));
        }
    }
    return stopped;
}

export function applySavedRollerRuntime(
    machine: MachineDashboard,
    savedSecByBin: Map<string, number>
): MachineDashboard {
    if (savedSecByBin.size === 0) return machine;
    return recountMachine({
        ...machine,
        rollers: machine.rollers.map((roller) => {
            const sec = savedSecByBin.get(roller.binLocation);
            if (sec == null) return roller;
            return withRollerStats(roller, sec / 3600, roller.limitHours);
        })
    });
}

function preserveRoller(
    incoming: RollerRow,
    old: RollerRow | undefined,
    elapsedHours: number,
    stillTicking: boolean
): RollerRow {
    if (!old) return incoming;

    if (incoming.rollerId && old.rollerId && incoming.rollerId !== old.rollerId) {
        return withRollerStats(incoming, incoming.runtimeHours, incoming.limitHours);
    }

    if (stillTicking && elapsedHours > 0) {
        const limitHours = incoming.limitHours || old.limitHours;
        return withRollerStats(
            { ...incoming, limitHours },
            old.runtimeHours + elapsedHours,
            limitHours
        );
    }

    return withRollerStats(incoming, incoming.runtimeHours, incoming.limitHours || old.limitHours);
}

export function mergePreservedRollers(
    incoming: MachineDashboard[],
    prev: MachineDashboard[],
    elapsedHours: number
): MachineDashboard[] {
    return incoming.map((m) => {
        const old = prev.find((p) => p.name === m.name);
        if (!old) return m;

        const rollers = m.rollers.map((roller, index) => {
            const oldRoller =
                old.rollers.find((r) => r.binLocation === roller.binLocation) ?? old.rollers[index];
            const stillTicking =
                old.running && m.running && !!oldRoller?.isActive && roller.isActive;
            const elapsed = stillTicking ? elapsedHours : 0;
            return preserveRoller(roller, oldRoller, elapsed, stillTicking);
        });

        return recountMachine({ ...m, rollers });
    });
}

export function mergePreservedMachines(
    incoming: MachineDashboard[],
    prev: MachineDashboard[],
    elapsedHours: number
): MachineDashboard[] {
    return mergePreservedFixedParts(mergePreservedRollers(incoming, prev, elapsedHours), prev, elapsedHours);
}
