export type ProcessCd = 'DRAWING' | 'STRANDING';
export type ShiftFilter = 'all' | 'Day' | 'Night';
export type StrandType = 'all' | 'Bucher' | 'Tubular';
export type NcStatus = 'NORMAL' | 'ABNORMAL';

export type MachineCall = {
    callTime: string;
    reason: string;
    remark?: string;
    handleRemark?: string;
    caller?: string;
    durMin?: number;
};

export type ProductionRun = {
    bobbin: string;
    machine: string;
    process: ProcessCd;
    /** Stranding only */
    strandType?: 'Bucher' | 'Tubular';
    start: string; // ISO
    end: string;
    matDes: string;
    speed: number;
    orderLen: number;
    prodLen: number;
    prodWt: number;
    expTimeMin: number;
    actTimeMin: number;
    nc: NcStatus;
    pe: number;
    operator: string;
    abnormal?: string;
    /** Actual << expected — procedure bypass heuristic */
    procFlag?: boolean;
    calls?: MachineCall[];
};

export type MachineAgg = {
    name: string;
    pe: number;
    gWt: number;
    nWt: number;
    gCnt: number;
    nCnt: number;
    coMin: number;
    operators: string[];
};

export type ShiftAgg = {
    period: 'Day' | 'Night';
    pe: number;
    gCnt: number;
    nCnt: number;
    gWt: number;
    nWt: number;
    coEvents: number;
    coMin: number;
    tLen: number;
    operators: string[];
};

export type OverviewAgg = {
    pe: number;
    dayPe: number;
    nightPe: number;
    bobbins: number;
    abnormal: number;
    coEvents: number;
    coMin: number;
    coRate: number;
    avgCo: number;
    tLen: number;
    tWt: number;
};
