import { bobbinNextApiPath, getBobbinDbTarget, type BobbinDbTarget } from './bobbinMonitoringDbTarget';

export type BobbinInventoryForScrapRow = {
    plNo: string;
    lcCd: string;
    materialCd: string;
    materialDesc: string;
    binLocationCd: string;
    storageLocationCd: string;
    balanceWt: number;
    balanceLength: number;
    prodDt: string;
    inventoryStatus: string;
    woProcessId: string;
};

function rowStr(row: Record<string, unknown>, key: string): string {
    const v = row[key] ?? row[key.toUpperCase()] ?? row[key.toLowerCase()];
    if (v == null || v === '') return '';
    return String(v).trim();
}

function rowNum(row: Record<string, unknown>, key: string): number {
    const v = row[key] ?? row[key.toUpperCase()];
    if (v == null || v === '') return 0;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
}

function mapRow(row: Record<string, unknown>): BobbinInventoryForScrapRow {
    return {
        plNo: rowStr(row, 'PL_NO'),
        lcCd: rowStr(row, 'LC_CD'),
        materialCd: rowStr(row, 'MATERIAL_CD'),
        materialDesc: rowStr(row, 'MATERIAL_DESC'),
        binLocationCd: rowStr(row, 'BIN_LOCATION_CD'),
        storageLocationCd: rowStr(row, 'STORAGE_LOCATION_CD'),
        balanceWt: rowNum(row, 'BALANCE_WT'),
        balanceLength: rowNum(row, 'BALANCE_LENGTH'),
        prodDt: rowStr(row, 'PROD_DT'),
        inventoryStatus: rowStr(row, 'INVENTORY_STATUS'),
        woProcessId: rowStr(row, 'WO_PROCESS_ID')
    };
}

export type FetchBobbinScrapInventoryResult =
    | { ok: true; rows: BobbinInventoryForScrapRow[]; scannedCode: string }
    | { ok: false; message: string; status: number };

/**
 * GET sp_Bobbin_Inventory_ForScrap_Select — rows on bobbin for scrap UI (full scanned barcode).
 */
export async function fetchBobbinInventoryForScrap(
    scannedBarcode: string,
    target: BobbinDbTarget = getBobbinDbTarget()
): Promise<FetchBobbinScrapInventoryResult> {
    const code = scannedBarcode.trim();
    if (!code) {
        return { ok: false, message: 'Enter a bobbin code.', status: 400 };
    }

    const qs = new URLSearchParams({ lc_cd: code });
    const path = bobbinNextApiPath('scrapinventory', target);
    const url = `${path}?${qs.toString()}`;

    let res: Response;
    try {
        res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    } catch {
        return { ok: false, message: 'Network error loading inventory for scrap.', status: 0 };
    }

    let body: unknown;
    try {
        body = await res.json();
    } catch {
        body = null;
    }

    if (!res.ok) {
        const msg =
            body &&
            typeof body === 'object' &&
            body !== null &&
            'error' in body &&
            typeof (body as { error: unknown }).error === 'string'
                ? (body as { error: string }).error
                : `Request failed (${res.status})`;
        return { ok: false, message: msg, status: res.status };
    }

    const rows = (Array.isArray(body) ? body : [])
        .filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object')
        .map(mapRow)
        .filter((r) => r.plNo);

    return { ok: true, rows, scannedCode: code };
}
