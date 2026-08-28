import type {
    MachineAgg,
    OverviewAgg,
    ProcessCd,
    ProductionRun,
    ShiftAgg,
    ShiftFilter,
    StrandType
} from './types';

/** Shift day rolls at 08:00; Day = 08:00–20:00, Night = 20:00–08:00. */
export function getShiftPeriod(iso: string): 'Day' | 'Night' {
    const h = new Date(iso).getHours();
    return h >= 8 && h < 20 ? 'Day' : 'Night';
}

export function getShiftDate(iso: string): string {
    const d = new Date(iso);
    if (d.getHours() < 8) d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function diffMin(a: string, b: string): number {
    return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
}

export type EfficiencyFilters = {
    process: ProcessCd;
    strandType: StrandType;
    dateFrom: string;
    dateTo: string;
    shift: ShiftFilter;
    operator: string;
};

export function filterRuns(runs: ProductionRun[], f: EfficiencyFilters): ProductionRun[] {
    return runs.filter((r) => {
        if (r.process !== f.process) return false;
        if (f.process === 'STRANDING' && f.strandType !== 'all' && r.strandType !== f.strandType) {
            return false;
        }
        const sd = getShiftDate(r.start);
        if (sd < f.dateFrom || sd > f.dateTo) return false;
        if (f.shift !== 'all' && getShiftPeriod(r.start) !== f.shift) return false;
        if (f.operator !== 'all' && r.operator !== f.operator) return false;
        return true;
    });
}

function sumPe(rows: ProductionRun[]): number {
    if (!rows.length) return 0;
    const exp = rows.reduce((s, r) => s + r.expTimeMin, 0);
    const act = rows.reduce((s, r) => s + r.actTimeMin, 0);
    if (act <= 0) return 0;
    return Math.min(100, Math.round((exp / act) * 1000) / 10);
}

function changeoverStats(rows: ProductionRun[]): { events: number; minutes: number } {
    const byMachine = new Map<string, ProductionRun[]>();
    for (const r of rows) {
        const list = byMachine.get(r.machine) ?? [];
        list.push(r);
        byMachine.set(r.machine, list);
    }
    let events = 0;
    let minutes = 0;
    Array.from(byMachine.values()).forEach((list) => {
        list.sort((a: ProductionRun, b: ProductionRun) => a.start.localeCompare(b.start));
        for (let i = 0; i < list.length - 1; i++) {
            const gap = diffMin(list[i].end, list[i + 1].start);
            if (gap > 0) {
                events += 1;
                minutes += gap;
            }
        }
    });
    return { events, minutes };
}

export function calcOverview(rows: ProductionRun[]): OverviewAgg {
    const day = rows.filter((r) => getShiftPeriod(r.start) === 'Day');
    const night = rows.filter((r) => getShiftPeriod(r.start) === 'Night');
    const co = changeoverStats(rows);
    const tLen = rows.reduce((s, r) => s + r.prodLen, 0);
    const tWt = rows.reduce((s, r) => s + r.prodWt, 0);
    const nCnt = rows.filter((r) => r.nc === 'ABNORMAL').length;
    const prodMin = rows.reduce((s, r) => s + r.actTimeMin, 0);
    const coRate = prodMin > 0 ? Math.round((co.minutes / (prodMin + co.minutes)) * 1000) / 10 : 0;
    return {
        pe: sumPe(rows),
        dayPe: sumPe(day),
        nightPe: sumPe(night),
        bobbins: rows.length,
        abnormal: nCnt,
        coEvents: co.events,
        coMin: co.minutes,
        coRate,
        avgCo: co.events ? Math.round((co.minutes / co.events) * 10) / 10 : 0,
        tLen,
        tWt: Math.round(tWt * 10) / 10
    };
}

export function calcShift(rows: ProductionRun[], period: 'Day' | 'Night'): ShiftAgg {
    const subset = rows.filter((r) => getShiftPeriod(r.start) === period);
    const co = changeoverStats(subset);
    return {
        period,
        pe: sumPe(subset),
        gCnt: subset.filter((r) => r.nc === 'NORMAL').length,
        nCnt: subset.filter((r) => r.nc === 'ABNORMAL').length,
        gWt: Math.round(subset.filter((r) => r.nc === 'NORMAL').reduce((s, r) => s + r.prodWt, 0) * 10) / 10,
        nWt: Math.round(subset.filter((r) => r.nc === 'ABNORMAL').reduce((s, r) => s + r.prodWt, 0) * 10) / 10,
        coEvents: co.events,
        coMin: co.minutes,
        tLen: subset.reduce((s, r) => s + r.prodLen, 0),
        operators: Array.from(new Set(subset.map((r) => r.operator).filter(Boolean))).sort()
    };
}

export function calcMachines(rows: ProductionRun[]): MachineAgg[] {
    const map = new Map<string, ProductionRun[]>();
    for (const r of rows) {
        const list = map.get(r.machine) ?? [];
        list.push(r);
        map.set(r.machine, list);
    }
    const out: MachineAgg[] = [];
    Array.from(map.entries()).forEach(([name, list]) => {
        const co = changeoverStats(list);
        out.push({
            name,
            pe: sumPe(list),
            gWt: Math.round(list.filter((r) => r.nc === 'NORMAL').reduce((s, r) => s + r.prodWt, 0) * 10) / 10,
            nWt: Math.round(list.filter((r) => r.nc === 'ABNORMAL').reduce((s, r) => s + r.prodWt, 0) * 10) / 10,
            gCnt: list.filter((r) => r.nc === 'NORMAL').length,
            nCnt: list.filter((r) => r.nc === 'ABNORMAL').length,
            coMin: co.minutes,
            operators: Array.from(new Set(list.map((r) => r.operator).filter(Boolean))).sort()
        });
    });
    return out.sort((a, b) => b.pe - a.pe);
}

export function formatNum(n: number): string {
    return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export function formatKg(n: number): string {
    return `${formatNum(n)} kg`;
}

export function formatTime(iso: string): string {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${mi}`;
}
