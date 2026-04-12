import { BOBBIN_DAYS_PER_YEAR } from './lifespanConversion';
import type { BobbinLifespanInfo, BobbinSummary } from './types';

/**
 * Combines cycle-based status with lifespan vs max **days** / warning %.
 * Elapsed time uses approximate days from calendar y/m/d since first cycle.
 */
export function mergeLifespanIntoStatus(
    cycleStatus: BobbinSummary['status'],
    lifespan: BobbinLifespanInfo | undefined,
    maxLifespanDays: number,
    warnPct: number
): BobbinSummary['status'] {
    if (cycleStatus === 'Expired / Not Usable') return cycleStatus;
    if (!lifespan?.hasStartDate || maxLifespanDays < 1) return cycleStatus;

    const usedYearsApprox = lifespan.years + lifespan.months / 12 + lifespan.days / BOBBIN_DAYS_PER_YEAR;
    const usedDaysApprox = usedYearsApprox * BOBBIN_DAYS_PER_YEAR;

    const lifeExceeded = usedDaysApprox >= maxLifespanDays;
    const lifeNear = !lifeExceeded && (usedDaysApprox / maxLifespanDays) * 100 >= warnPct;

    if (lifeExceeded) return 'Reached Limit';
    if (lifeNear) {
        if (cycleStatus === 'Reached Limit') return cycleStatus;
        return 'Near Limit';
    }
    return cycleStatus;
}
