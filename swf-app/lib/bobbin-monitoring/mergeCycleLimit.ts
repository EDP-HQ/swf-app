import type { BobbinSummary } from './types';

function clampWarnPct(pct: number): number {
    if (!Number.isFinite(pct)) return 80;
    return Math.min(100, Math.max(1, Math.round(pct)));
}

/**
 * Apply operator-entered max cycles and usage warning threshold (% of max).
 * `null` limit keeps API-derived summary unchanged.
 */
export function mergeSummaryWithCycleLimit(
    base: BobbinSummary,
    limit: number | null,
    warnAtUsagePct: number
): BobbinSummary {
    if (limit == null || limit <= 0 || !Number.isFinite(limit)) return base;

    const warnPct = clampWarnPct(warnAtUsagePct);
    const current = base.currentCycleCount;
    const remaining = Math.max(0, limit - current);
    let status = base.status;
    if (status !== 'Expired / Not Usable') {
        if (current >= limit) status = 'Reached Limit';
        else if ((current / limit) * 100 >= warnPct) status = 'Near Limit';
        else status = 'Active';
    }

    return {
        ...base,
        maxCycleLimit: limit,
        remainingCycles: remaining,
        status
    };
}
