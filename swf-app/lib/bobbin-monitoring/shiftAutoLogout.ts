/**
 * Shift handover: sign out at 08:00 and 20:00 local time.
 * If the device slept through a boundary, logging in again is still gated by
 * `sessionCrossedShiftBoundarySince` on the next tick.
 */

const SHIFT_HOURS = [8, 20] as const;

/** True if any 08:00 or 20:00 local boundary occurred after `loginAtMs` and on or before `nowMs`. */
export function sessionCrossedShiftBoundarySince(loginAtMs: number, nowMs: number = Date.now()): boolean {
    if (nowMs <= loginAtMs) return false;

    const login = new Date(loginAtMs);
    const now = new Date(nowMs);

    const dayStart = new Date(login.getFullYear(), login.getMonth(), login.getDate(), 0, 0, 0, 0);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    const cursor = new Date(dayStart);
    while (cursor.getTime() <= lastDay.getTime()) {
        const y = cursor.getFullYear();
        const m = cursor.getMonth();
        const d = cursor.getDate();
        for (const hour of SHIFT_HOURS) {
            const boundary = new Date(y, m, d, hour, 0, 0, 0).getTime();
            if (boundary > loginAtMs && boundary <= nowMs) return true;
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    return false;
}
