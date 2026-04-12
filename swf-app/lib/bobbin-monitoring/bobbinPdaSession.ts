/**
 * Browser session after sp_Bobbin_Tracker_Login_Check succeeds (bobbin monitoring gate).
 */

export type BobbinPdaSession = {
    empCd: string;
    empName: string | null;
    permId: string | number | null;
    loggedInAt: number;
};

const STORAGE_KEY = 'bobbin-monitor-pda-session';

/** Persists across tabs / restarts — last sign-out time for this browser (localStorage). */
const LAST_LOGOUT_AT_KEY = 'bobbin-monitor-last-logout-at';

/** Call on any PDA sign-out (manual, shift auto-logout, etc.). */
export function recordBobbinPdaLogout(): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(LAST_LOGOUT_AT_KEY, new Date().toISOString());
    } catch {
        /* ignore */
    }
}

/** ISO string or null if never recorded on this device. */
export function getLastBobbinPdaLogoutIso(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const v = localStorage.getItem(LAST_LOGOUT_AT_KEY);
        if (!v) return null;
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? null : v;
    } catch {
        return null;
    }
}

/** Localized display for login screen, or null. */
export function formatLastBobbinPdaLogout(): string | null {
    const iso = getLastBobbinPdaLogoutIso();
    if (!iso) return null;
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
}

export function getBobbinPdaSession(): BobbinPdaSession | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const o = JSON.parse(raw) as Partial<BobbinPdaSession>;
        if (typeof o.empCd !== 'string' || typeof o.loggedInAt !== 'number') {
            return null;
        }
        return {
            empCd: o.empCd,
            empName: typeof o.empName === 'string' ? o.empName : null,
            permId: o.permId ?? null,
            loggedInAt: o.loggedInAt
        };
    } catch {
        return null;
    }
}

export function setBobbinPdaSession(session: BobbinPdaSession): void {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
        /* ignore */
    }
}

export function clearBobbinPdaSession(): void {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
}
