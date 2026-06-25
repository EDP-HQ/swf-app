/** Default runtime limit (hours) when API does not provide one. */
export const ROLLER_DEFAULT_LIMIT_HOURS = 3000;

/** Default limit for gearbox (1 per machine). */
export const GEARBOX_DEFAULT_LIMIT_HOURS = 8000;

/** Default limit for each skipper bearing (SF + SB per machine). */
export const SKIPPER_BEARING_DEFAULT_LIMIT_HOURS = 6000;

/** Fraction of limit at which status becomes Due (matches desktop app). */
export const ROLLER_DUE_FRACTION = 0.8;

/** Auto-refresh interval for dashboard data (ms). */
export const ROLLER_AUTO_REFRESH_MS = 30_000;

/** Live runtime tick interval for running machines (ms). */
export const ROLLER_LIVE_TICK_MS = 1000;
