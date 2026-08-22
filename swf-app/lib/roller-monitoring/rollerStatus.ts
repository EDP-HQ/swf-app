import { ROLLER_DUE_FRACTION } from './constants';
import type { PartHealthStatus, RollerHealthStatus } from './types';

export function computeRollerStatus(runtimeHours: number, limitHours: number): RollerHealthStatus {
    if (limitHours <= 0) return 'Overdue';
    const ratio = runtimeHours / limitHours;
    if (ratio >= 1) return 'Overdue';
    if (ratio >= ROLLER_DUE_FRACTION) return 'Due';
    return 'OK';
}

/** Due and Overdue — shown in Need attention lists. */
export function needsAttentionStatus(status: PartHealthStatus): boolean {
    return status === 'Due' || status === 'Overdue';
}

export function usagePct(runtimeHours: number, limitHours: number): number {
    if (limitHours <= 0) return 100;
    return Math.min(100, Math.round((runtimeHours / limitHours) * 100));
}
