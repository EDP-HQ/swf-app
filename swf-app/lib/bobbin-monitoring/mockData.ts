import type { BobbinDetails, BobbinHistoryRow, BobbinSummary } from './types';

/** Sample data for UI preview; replace with API mapping later. */
export const MOCK_BOBBIN_SUMMARY: BobbinSummary = {
    bobbinCode: 'BBN-2026-001245',
    currentCycleCount: 18,
    maxCycleLimit: 25,
    remainingCycles: 7,
    status: 'Near Limit'
};

export const MOCK_BOBBIN_DETAILS: BobbinDetails = {
    bobbinType: 'Plastic Bobbin A',
    machineLine: 'Line 3',
    lastScanDateTime: '2026-04-09 10:22',
    lastOperator: 'Operator Amin',
    createdDate: '2026-01-15 08:00',
    remarks: 'Inspection recommended soon'
};

export const MOCK_HISTORY: BobbinHistoryRow[] = [
    {
        id: '1',
        dateTime: '2026-04-09 10:22',
        bobbinCode: 'BBN-2026-001245',
        action: 'Scan',
        cycleBefore: 17,
        cycleAfter: 18,
        operator: 'Operator Amin',
        machineLine: 'Line 3'
    },
    {
        id: '2',
        dateTime: '2026-04-08 15:40',
        bobbinCode: 'BBN-2026-001245',
        action: 'Scan',
        cycleBefore: 16,
        cycleAfter: 17,
        operator: 'Operator Siti',
        machineLine: 'Line 2'
    },
    {
        id: '3',
        dateTime: '2026-04-08 09:12',
        bobbinCode: 'BBN-2026-001245',
        action: 'Scan',
        cycleBefore: 15,
        cycleAfter: 16,
        operator: 'Operator Farid',
        machineLine: 'Line 3'
    }
];

/**
 * Simulates a backend check. Wire this to `fetch('/api/bobbin/...')` later.
 * Demo triggers: `NOTFOUND` → not found, `ERROR` → error, any other non-empty → found with mock data.
 */
export async function simulateBobbinCheck(code: string): Promise<
    | { ok: true; summary: BobbinSummary; details: BobbinDetails; history: BobbinHistoryRow[] }
    | { ok: false; reason: 'notFound' | 'error'; message?: string }
> {
    const trimmed = code.trim();
    await new Promise((r) => setTimeout(r, 350));

    if (trimmed.toUpperCase() === 'NOTFOUND') {
        return { ok: false, reason: 'notFound' };
    }
    if (trimmed.toUpperCase() === 'ERROR') {
        return { ok: false, reason: 'error', message: 'Unable to load bobbin information. Please try again.' };
    }

    const summary: BobbinSummary = {
        ...MOCK_BOBBIN_SUMMARY,
        bobbinCode: trimmed || MOCK_BOBBIN_SUMMARY.bobbinCode
    };

    return {
        ok: true,
        summary,
        details: MOCK_BOBBIN_DETAILS,
        history: MOCK_HISTORY.map((row) => ({
            ...row,
            bobbinCode: summary.bobbinCode
        }))
    };
}
