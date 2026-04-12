/**
 * Company / factory / lang for bobbin cycle are configured on swf-api (`config/bobbinApi.js` or BOBBIN_API_* env).
 * Clients only send lc_cd to /bobbin/bobbincycle; bobbin lifespan uses lc_cd only as well.
 */

/** Each API row with GUBUN equal to this value counts as one production cycle. */
export const BOBBIN_GUBUN_CYCLE = 'PRODUCTION';

/** Default max cycles shown until the operator changes it in settings. */
export const BOBBIN_DEFAULT_CYCLE_LIMIT = 50;

/** Default usage % (current ÷ max) at which alerts and “Near limit” styling apply. */
export const BOBBIN_DEFAULT_USAGE_WARNING_PCT = 80;

/**
 * Default max lifespan in **days** (TB_BOBBIN_LIMIT.BobbinLifeSpanLimit).
 * ~15 years at 365.25 d/yr when the row omits the column.
 */
export const BOBBIN_DEFAULT_LIFESPAN_LIMIT_DAYS = Math.round(15 * 365.25);

/** Default % of max lifespan (by days) at which to warn. */
export const BOBBIN_DEFAULT_LIFESPAN_WARNING_PCT = 80;
