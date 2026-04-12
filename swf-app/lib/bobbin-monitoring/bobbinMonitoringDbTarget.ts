/**
 * Bobbin API database target: LOCAL (localdb) vs PROD (sfcwrdb) on swf-api.
 * The value is stored in sessionStorage and is read on every fetch so the app follows the developer toggle.
 * Only the developer panel (after unlock) should call setBobbinDbTarget.
 */

export type BobbinDbTarget = 'local' | 'production';

export const BOBBIN_DEV_MODE_STORAGE_KEY = 'bobbin-monitor-dev-mode';

const DB_TARGET_STORAGE_KEY = 'bobbin-monitor-db-target';

/** Effective target for all bobbin API paths (limit / cycle / lifespan). Default: PROD until user picks LOCAL. */
export function getBobbinDbTarget(): BobbinDbTarget {
    if (typeof window === 'undefined') return 'production';
    try {
        const v = sessionStorage.getItem(DB_TARGET_STORAGE_KEY);
        if (v === 'local') return 'local';
        return 'production';
    } catch {
        return 'production';
    }
}

export function bobbinDbTargetLabel(target: BobbinDbTarget): string {
    return target === 'production' ? 'PROD' : 'LOCAL';
}

export function setBobbinDbTarget(target: BobbinDbTarget): void {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.setItem(DB_TARGET_STORAGE_KEY, target);
    } catch {
        /* ignore */
    }
}

export type BobbinApiEndpoint =
    | 'limitwarning'
    | 'bobbincycle'
    | 'bobbinlifespan'
    | 'pdalogin'
    | 'pdascrap';

/** Path on swf-api, e.g. `/bobbin/limitwarning` or `/bobbin/sfcwr/limitwarning`. */
export function bobbinSwfApiPath(endpoint: BobbinApiEndpoint, target: BobbinDbTarget = getBobbinDbTarget()): string {
    return target === 'production' ? `/bobbin/sfcwr/${endpoint}` : `/bobbin/${endpoint}`;
}

/** Path on Next.js, e.g. `/api/bobbin/limitwarning` or `/api/bobbin/sfcwr/limitwarning`. */
export function bobbinNextApiPath(endpoint: BobbinApiEndpoint, target: BobbinDbTarget = getBobbinDbTarget()): string {
    return target === 'production' ? `/api/bobbin/sfcwr/${endpoint}` : `/api/bobbin/${endpoint}`;
}
