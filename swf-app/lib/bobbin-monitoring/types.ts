/** UI-only status labels; map to Tag severity in the page. */
export type BobbinUiStatus =
    | 'Active'
    | 'Near Limit'
    | 'Reached Limit'
    | 'Expired / Not Usable'
    | 'Not Found';

export interface BobbinSummary {
    bobbinCode: string;
    currentCycleCount: number;
    maxCycleLimit: number;
    remainingCycles: number;
    status: Exclude<BobbinUiStatus, 'Not Found'>;
}

export interface BobbinDetails {
    bobbinType: string;
    machineLine: string;
    lastScanDateTime: string;
    lastOperator: string;
    createdDate: string;
    remarks: string;
}

/** First cycle date + elapsed time since then (for BOBBIN INFORMATION). */
export interface BobbinLifespanInfo {
    firstCycleDateLabel: string;
    years: number;
    months: number;
    days: number;
    hasStartDate: boolean;
}

export interface BobbinHistoryRow {
    id: string;
    dateTime: string;
    bobbinCode: string;
    action: string;
    cycleBefore: number;
    cycleAfter: number;
    operator: string;
    machineLine: string;
}

export type BobbinCheckState =
    | { kind: 'idle' }
    | { kind: 'loading'; pendingCode: string }
    | {
          kind: 'found';
          /** Values from API before optional manual cycle limit */
          baseSummary: BobbinSummary;
          /** Last 4 digits sent as LC_CD to the API */
          lcCd: string;
          lifespan: BobbinLifespanInfo;
      }
    | { kind: 'notFound'; code: string; lcCd?: string }
    | { kind: 'error'; message: string };
