export type PartHealthStatus = 'OK' | 'Due' | 'Overdue';

export type FixedPartKind = 'gearbox' | 'skipper_bearing_sf' | 'skipper_bearing_sb' | 'custom';

export type MachineFixedPartKey = 'gearbox' | 'skipperFront' | 'skipperBack';

export type RollerRow = {
    displayName: string;
    binLocation: string;
    description: string;
    machineCode: string;
    rollerId: string;
    runtimeHours: number;
    limitHours: number;
    replaceDt: string;
    isActive: boolean;
    status: PartHealthStatus;
    usagePct: number;
};

export type FixedPartRow = {
    partId?: string;
    partType?: string;
    partSeq?: number;
    partKind: FixedPartKind;
    displayName: string;
    runtimeHours: number;
    limitHours: number;
    replaceDt: string;
    status: PartHealthStatus;
    usagePct: number;
};

export type PlantRunStatus = 'run' | 'stop' | 'not_found';

/** Run/Stop only when linked to a plant machine; otherwise Not found. */
export function plantRunStatus(machine: Pick<MachineDashboard, 'running' | 'machineNo'>): PlantRunStatus {
    if (!String(machine.machineNo || '').trim()) return 'not_found';
    return machine.running ? 'run' : 'stop';
}

export type MachineDashboard = {
    name: string;
    machineNo: string;
    running: boolean;
    rollers: RollerRow[];
    gearbox: FixedPartRow;
    skipperFront: FixedPartRow;
    skipperBack: FixedPartRow;
    /** Additional registered parts (bearing, etc.) — PART_SEQ 4+. */
    extraParts: FixedPartRow[];
    okCount: number;
    dueCount: number;
    overdueCount: number;
    activeCount: number;
};

export type RollerDashboardData = {
    machines: MachineDashboard[];
    lastSync: string;
};

/** @deprecated use PartHealthStatus */
export type RollerHealthStatus = PartHealthStatus;
