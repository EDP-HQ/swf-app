/** Average year length for converting TB_BOBBIN_LIMIT.BobbinLifeSpanLimit (days) ↔ UI years. */
export const BOBBIN_DAYS_PER_YEAR = 365.25;

export function lifespanDaysToYears(days: number): number {
    if (!Number.isFinite(days) || days <= 0) return 0;
    return days / BOBBIN_DAYS_PER_YEAR;
}

/** Rounds to one decimal for display (e.g. subtitle). */
export function formatLifespanYearsFromDays(days: number): string {
    const y = lifespanDaysToYears(days);
    return (Math.round(y * 10) / 10).toFixed(1);
}

/** Converts operator-entered whole years to days for INSERT/UPDATE. */
export function lifespanYearsToDays(years: number): number {
    if (!Number.isFinite(years) || years <= 0) return 1;
    return Math.max(1, Math.round(years * BOBBIN_DAYS_PER_YEAR));
}

/** Whole years for settings dialog (rounded from DB days). */
export function lifespanDaysToWholeYears(days: number): number {
    return Math.max(1, Math.round(lifespanDaysToYears(days)));
}
