/**
 * Roller / components API always uses production (sfcwrdb) on swf-api.
 */

export type RollerDbTarget = 'production';

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

export function getRollerDbTarget(): RollerDbTarget {
    return 'production';
}

/** Path on swf-api, e.g. `/roller/sfcwr/list`. */
export function rollerSwfApiPath(endpoint: RollerApiEndpoint, _target: RollerDbTarget = 'production'): string {
    return `/roller/sfcwr/${endpoint}`;
}

/** Path on Next.js, e.g. `/api/roller/sfcwr/list`. */
export function rollerNextApiPath(endpoint: RollerApiEndpoint, _target: RollerDbTarget = 'production'): string {
    return `/api/roller/sfcwr/${endpoint}`;
}
