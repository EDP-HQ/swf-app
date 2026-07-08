/**
 * Roller API database target: LOCAL (localdb) vs PROD (sfcwrdb) on swf-api.
 * Stored in sessionStorage and read on every fetch.
 */

export type RollerDbTarget = 'local' | 'production';

const DB_TARGET_STORAGE_KEY = 'roller-monitor-db-target';

/** sessionStorage flag — same pattern as bobbin monitoring developer mode. */
export const ROLLER_DEV_MODE_STORAGE_KEY = 'component-monitor-dev-mode';

/** Default: PROD (remote sfcwrdb) until user picks LOCAL. */
export function getRollerDbTarget(): RollerDbTarget {
    if (typeof window === 'undefined') return 'production';
    try {
        const v = sessionStorage.getItem(DB_TARGET_STORAGE_KEY);
        if (v === 'local') return 'local';
        return 'production';
    } catch {
        return 'production';
    }
}

export function rollerDbTargetLabel(target: RollerDbTarget): string {
    return target === 'production' ? 'PROD' : 'LOCAL';
}

export function rollerDbServerHint(target: RollerDbTarget): string {
    return target === 'production' ? '194.1.31.3 / SFC_WR_DB' : '127.0.0.1 / SFC_WR_DB';
}

export function setRollerDbTarget(target: RollerDbTarget): void {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.setItem(DB_TARGET_STORAGE_KEY, target);
    } catch {
        /* ignore */
    }
}

export type RollerApiEndpoint =
    | 'onoff'
    | 'list'
    | 'activelist'
    | 'currentruntime'
    | 'history'
    | 'updateruntimelimit'
    | 'batchupdateruntimelimit'
    | 'updateruntime'
    | 'replace';

/** Path on swf-api, e.g. `/roller/list` or `/roller/sfcwr/list`. */
export function rollerSwfApiPath(
    endpoint: RollerApiEndpoint,
    target: RollerDbTarget = getRollerDbTarget()
): string {
    return target === 'production' ? `/roller/sfcwr/${endpoint}` : `/roller/${endpoint}`;
}

/** Path on Next.js, e.g. `/api/roller/list` or `/api/roller/sfcwr/list`. */
export function rollerNextApiPath(
    endpoint: RollerApiEndpoint,
    target: RollerDbTarget = getRollerDbTarget()
): string {
    return target === 'production' ? `/api/roller/sfcwr/${endpoint}` : `/api/roller/${endpoint}`;
}
