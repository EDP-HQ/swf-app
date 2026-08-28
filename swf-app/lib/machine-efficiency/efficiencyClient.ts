import type { MachineCall, ProcessCd, ProductionRun } from './types';

export type EfficiencyBundleResponse = {
    sources?: { production: string; calls: string };
    params?: Record<string, string>;
    count?: { runs: number; calls: number };
    runs?: ProductionRun[];
    calls?: MachineCall[];
    error?: string;
};

/**
 * Live efficiency bundle via Next proxy → swf-api
 * (USP_SFC_KPRD060_R10 + USP_SFC_CALL031_R10, read-only).
 */
export async function fetchEfficiencyBundle(opts: {
    process: ProcessCd;
    dateFrom: string;
    dateTo: string;
    signal?: AbortSignal;
}): Promise<EfficiencyBundleResponse> {
    const qs = new URLSearchParams({
        dateFrom: opts.dateFrom,
        dateTo: opts.dateTo,
        process: opts.process
    });

    const url = `/api/efficiency/sfcwr/bundle?${qs.toString()}`;
    const res = await fetch(url, { signal: opts.signal, cache: 'no-store' });
    const data = (await res.json().catch(() => ({}))) as EfficiencyBundleResponse;
    if (!res.ok) {
        throw new Error(data.error || `Efficiency API failed (${res.status})`);
    }
    return data;
}
